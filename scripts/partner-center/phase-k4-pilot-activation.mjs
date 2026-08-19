#!/usr/bin/env node
/**
 * Phase K.4 — Wave 3 conservative cash campaign pilot (Production).
 * Creates draft, verifies zero delta, activates, reconciles.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  adminCreateCampaign,
  adminCreateMission,
  adminCampaignAction,
  adminSetMissionStatus,
  enrichCampaignsForAdmin,
} from "../../lib/partner-center/admin-marketing-service.js";

const ROOT = join(import.meta.dirname, "../..");
const DOCS = join(ROOT, "docs/partner-center");

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function financialSnapshot(supabase) {
  const q = async (sql) => {
    const { data, error } = await supabase.rpc("exec_sql", { query: sql }).catch(() => ({ data: null, error: true }));
    if (error) return null;
    return data;
  };
  const [
    { count: partners },
    { count: referrals },
    { data: commissions },
    { count: ledgerCount },
    { count: entitlements },
    { count: participants },
    { data: campaigns },
    { count: missionProgress },
    { count: milestoneGrants },
    { count: riskHolds },
    { count: fraudAssessments },
    { count: qrrCredits },
    { data: balances },
  ] = await Promise.all([
    supabase.from("partners").select("id", { count: "exact", head: true }),
    supabase.from("partner_referrals").select("id", { count: "exact", head: true }),
    supabase.from("partner_commissions").select("amount"),
    supabase.from("partner_financial_ledger_entries").select("id", { count: "exact", head: true }),
    supabase.from("partner_reward_entitlements").select("id", { count: "exact", head: true }),
    supabase.from("partner_campaign_participants").select("id", { count: "exact", head: true }),
    supabase.from("partner_campaign_programs").select("code, amount_spent, amount_reversed, global_budget_amount"),
    supabase.from("partner_mission_progress").select("id", { count: "exact", head: true }),
    supabase.from("partner_milestone_grants").select("id", { count: "exact", head: true }),
    supabase.from("partner_financial_risk_holds").select("id", { count: "exact", head: true }),
    supabase.from("partner_fraud_assessments").select("id", { count: "exact", head: true }),
    supabase.from("partner_qualified_referral_reward_credits").select("id", { count: "exact", head: true }),
    supabase.from("partners").select("balance_pending, balance_withdrawable, total_earnings"),
  ]);

  const commissionSum = (commissions || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const balancePending = (balances || []).reduce((s, r) => s + Number(r.balance_pending || 0), 0);
  const balanceWithdrawable = (balances || []).reduce((s, r) => s + Number(r.balance_withdrawable || 0), 0);
  const totalEarnings = (balances || []).reduce((s, r) => s + Number(r.total_earnings || 0), 0);
  const amountSpent = (campaigns || []).reduce((s, c) => s + Number(c.amount_spent || 0), 0);
  const amountReversed = (campaigns || []).reduce((s, c) => s + Number(c.amount_reversed || 0), 0);

  return {
    capturedAt: new Date().toISOString(),
    partners: partners || 0,
    referrals: referrals || 0,
    commissions: { count: (commissions || []).length, sum: Math.round(commissionSum * 100) / 100 },
    ledger: { count: ledgerCount || 0 },
    entitlements: entitlements || 0,
    campaignParticipants: participants || 0,
    amountSpent,
    amountReversed,
    missionProgress: missionProgress || 0,
    milestoneGrants: milestoneGrants || 0,
    riskHolds: riskHolds || 0,
    fraudAssessments: fraudAssessments || 0,
    qrrCredits: qrrCredits || 0,
    balances: {
      pending: Math.round(balancePending * 100) / 100,
      withdrawable: Math.round(balanceWithdrawable * 100) / 100,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
    },
  };
}

function delta(pre, post) {
  return {
    entitlements: (post.entitlements || 0) - (pre.entitlements || 0),
    ledger: (post.ledger?.count || 0) - (pre.ledger?.count || 0),
    amountSpent: (post.amountSpent || 0) - (pre.amountSpent || 0),
    missionProgress: (post.missionProgress || 0) - (pre.missionProgress || 0),
    balancesPending: (post.balances?.pending || 0) - (pre.balances?.pending || 0),
    balancesWithdrawable: (post.balances?.withdrawable || 0) - (pre.balances?.withdrawable || 0),
  };
}

loadEnvLocal();
process.env.PARTNER_GROWTH_ENGINE = "true";
process.env.PARTNER_ADMIN_MARKETING = "true";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const actorUserId = null;

const activationAt = new Date();
const startAt = activationAt.toISOString();
const endAt = new Date(activationAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

const pre = await financialSnapshot(supabase);
mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, "phase-k4-pre-activation-baseline-20260819.json"), JSON.stringify(pre, null, 2));

const campaignInput = {
  code: "wave3_qualified_referral_pilot",
  name: "Wave 3 Qualified Referral Pilot",
  name_ar: "تجربة مكافآت الإحالات المؤهلة — Wave 3",
  description: "Conservative $25 hard-capped pilot — $0.25 per canonical qualified referral",
  description_ar: "تجربة محافظة بميزانية $25 — $0.25 لكل إحالة مؤهلة",
  status: "draft",
  landing_path: "/register",
  start_at: startAt,
  end_at: endAt,
  effective_from: startAt,
  effective_to: endAt,
  global_budget_amount: 25,
  budget_currency: "USD",
  amount_spent: 0,
  amount_reversed: 0,
  per_partner_reward_cap: 2,
  max_participants: 50,
  partner_eligibility: { mode: "all" },
  priority: 20,
  creative_metadata: {
    name_ar: "تجربة مكافآت الإحالات المؤهلة",
    description_ar: "احصل على $0.25 لكل إحالة مؤهلة خلال 14 يومًا — حد أقصى $2 لكل شريك",
  },
  tracking_metadata: {
    lifecycle: "draft",
    financial: true,
    max_exposure_usd: 25,
    phase: "K.4",
    trigger: "qualified_referral",
  },
};

const existing = await supabase
  .from("partner_campaign_programs")
  .select("*")
  .eq("code", "wave3_qualified_referral_pilot")
  .maybeSingle();

let campaign;
if (existing.data?.id) {
  campaign = existing.data;
  console.log(`Reusing existing draft campaign ${campaign.id}`);
} else {
  campaign = await adminCreateCampaign(supabase, campaignInput, actorUserId);
}

const missionExisting = await supabase
  .from("partner_mission_definitions")
  .select("*")
  .eq("code", "wave3_pilot_qualified_referral_reward")
  .maybeSingle();

let mission;
if (missionExisting.data?.id) {
  mission = missionExisting.data;
} else {
  const missionInput = {
    code: "wave3_pilot_qualified_referral_reward",
    name: "مكافأة الإحالة المؤهلة — تجربة Wave 3",
    description: "$0.25 per distinct canonical qualified referral during campaign window",
    mission_type: "qualified_referrals_in_period",
    target_metric: "qualified_referrals",
    target_value: 1,
    reward_amount: 0.25,
    reward_currency: "USD",
    period_type: "once",
    max_completions: 8,
    status: "draft",
    campaign_program_id: campaign.id,
    start_at: campaign.start_at || startAt,
    end_at: campaign.end_at || endAt,
    effective_from: campaign.effective_from || startAt,
    eligibility_rules: { trusted_event: "qualified_referral" },
    fraud_policy: { blockOnHigh: true, blockOnBlocked: true },
  };
  mission = await adminCreateMission(supabase, missionInput, actorUserId);
}

const postDraft = await financialSnapshot(supabase);
const draftDelta = delta(pre, postDraft);
if (
  draftDelta.entitlements !== 0 ||
  draftDelta.ledger !== 0 ||
  draftDelta.amountSpent !== 0 ||
  draftDelta.balancesPending !== 0 ||
  draftDelta.balancesWithdrawable !== 0
) {
  throw new Error(`Draft creation economic delta non-zero: ${JSON.stringify(draftDelta)}`);
}

const activatedCampaign =
  campaign.status === "active"
    ? campaign
    : await adminCampaignAction(supabase, campaign.id, "activate", actorUserId, {
        reason: "Phase K.4 Wave 3 conservative cash campaign pilot",
      });
const activatedMission =
  mission.status === "active"
    ? mission
    : await adminSetMissionStatus(supabase, mission.id, "active", actorUserId, {
        reason: "Phase K.4 linked pilot reward",
      });

const postActivate = await financialSnapshot(supabase);
const activationDelta = delta(pre, postActivate);
if (
  activationDelta.entitlements !== 0 ||
  activationDelta.ledger !== 0 ||
  activationDelta.amountSpent !== 0 ||
  activationDelta.balancesPending !== 0 ||
  activationDelta.balancesWithdrawable !== 0
) {
  await adminCampaignAction(supabase, campaign.id, "pause", actorUserId, {
    reason: "EMERGENCY: unexpected activation economic delta",
  });
  throw new Error(`Activation economic delta non-zero: ${JSON.stringify(activationDelta)}`);
}

const [enriched] = await enrichCampaignsForAdmin(supabase, [activatedCampaign]);

const result = {
  phase: "K.4",
  verdict: "PASS",
  activationTimestamp: startAt,
  campaign: {
    id: activatedCampaign.id,
    code: activatedCampaign.code,
    status: activatedCampaign.status,
    globalBudget: 25,
    perPartnerCap: 2,
    reward: 0.25,
    maxParticipants: 50,
    startAt,
    endAt,
    amountSpent: activatedCampaign.amount_spent,
    amountReversed: activatedCampaign.amount_reversed,
    adminMetrics: enriched?.adminMetrics || null,
  },
  mission: {
    id: activatedMission.id,
    code: activatedMission.code,
    status: activatedMission.status,
    missionType: activatedMission.mission_type,
    maxCompletions: activatedMission.max_completions,
  },
  preBaseline: pre,
  postActivation: postActivate,
  draftDelta,
  activationDelta,
  rollback: "PATCH action=pause on wave3_qualified_referral_pilot + pause linked mission",
};

writeFileSync(join(DOCS, "phase-k4-wave3-pilot-activation-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

import { QUALIFICATION_STATES } from "./constants.js";
import { transitionReferralQualification } from "./qualification-engine.js";
import { computePartnerMetrics, reconcileMetricsCache } from "./partner-metrics.js";
import { reversePartnerLedgerEntryAtomic } from "./financial-gateway.js";
import { upsertMissionProgress } from "./mission-engine.js";
import { buildLeaderboardSnapshot } from "./leaderboard-engine.js";
import { logPartnerCenterEvent } from "./observability.js";
import { roundMoney } from "./money.js";

/**
 * Milestone reversal policy: achievement history preserved; grant status → reversed;
 * financial reversal via ledger gateway when credited.
 */
export async function reverseGrowthRewardEntitlement(supabase, entitlementId, { reason = "refund_reversal" } = {}) {
  const { data: ent, error } = await supabase
    .from("partner_reward_entitlements")
    .select("*")
    .eq("id", entitlementId)
    .single();
  if (error) throw error;
  if (!ent?.id) return { reversed: false, reason: "not_found" };
  if (ent.status === "reversed") return { reversed: false, duplicate: true, entitlementId };

  if (ent.status === "earned" || ent.status === "pending") {
    await supabase
      .from("partner_reward_entitlements")
      .update({ status: "reversed", updated_at: new Date().toISOString() })
      .eq("id", entitlementId);
    return { reversed: true, financial: false, entitlementId };
  }

  if (ent.ledger_entry_id && ["reward_credited", "risk_hold", "approved", "payable"].includes(ent.status)) {
    const rev = await reversePartnerLedgerEntryAtomic(supabase, ent.ledger_entry_id, reason);
    if (rev.reversed || rev.duplicate) {
      const bucket = ent.reward_type === "performance_bonus" ? "pending" : "bonus_pending";
      const amt = Number(ent.amount || 0);
      const partner = await supabase.from("partners").select("balance_pending, balance_bonus_pending, total_earnings").eq("id", ent.partner_id).single();
      if (partner.data) {
        const updates = {};
        if (bucket === "pending") {
          updates.balance_pending = roundMoney(Math.max(0, Number(partner.data.balance_pending || 0) - amt));
        } else {
          updates.balance_bonus_pending = roundMoney(Math.max(0, Number(partner.data.balance_bonus_pending || 0) - amt));
        }
        updates.total_earnings = roundMoney(Math.max(0, Number(partner.data.total_earnings || 0) - amt));
        await supabase.from("partners").update(updates).eq("id", ent.partner_id);
      }
      await supabase
        .from("partner_reward_entitlements")
        .update({ status: "reversed", updated_at: new Date().toISOString() })
        .eq("id", entitlementId);

      const campaignProgramId = ent.metadata?.campaignProgramId || ent.metadata?.campaign_program_id;
      if (campaignProgramId) {
        const { data: campaign } = await supabase
          .from("partner_campaign_programs")
          .select("id, amount_reversed")
          .eq("id", campaignProgramId)
          .maybeSingle();
        if (campaign?.id) {
          await supabase
            .from("partner_campaign_programs")
            .update({
              amount_reversed: roundMoney(Number(campaign.amount_reversed || 0) + amt),
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);
        }
      }

      return { reversed: true, financial: true, reversalId: rev.reversalId, entitlementId };
    }
  }

  return { reversed: false, reason: "not_reversible", entitlementId };
}

export async function onPartnerRefundOrDisqualification(supabase, {
  partnerId,
  referralId,
  referredUserId,
  reason = "refund_or_chargeback",
}) {
  await transitionReferralQualification(supabase, {
    referralId,
    partnerId,
    toState: QUALIFICATION_STATES.DISQUALIFIED,
    reason,
  });

  const { data: allEntitlements } = await supabase
    .from("partner_reward_entitlements")
    .select("id, status, metadata")
    .eq("partner_id", partnerId);

  const reversals = [];
  for (const ent of (allEntitlements || []).filter((e) => e.status !== "reversed")) {
    if (ent.metadata?.referralId && ent.metadata.referralId !== referralId) continue;
    reversals.push(await reverseGrowthRewardEntitlement(supabase, ent.id, { reason }));
  }

  const metrics = await computePartnerMetrics(supabase, partnerId);
  const { data: allProgress } = await supabase
    .from("partner_mission_progress")
    .select("id, mission_id, current_value, target_value, status, period_key")
    .eq("partner_id", partnerId);

  const missions = (allProgress || []).filter((p) =>
    ["in_progress", "completed", "reward_credited"].includes(p.status)
  );

  for (const progress of missions || []) {
    const { data: missionDef } = await supabase
      .from("partner_mission_definitions")
      .select("id, target_value, start_at, end_at, rule_version")
      .eq("id", progress.mission_id)
      .maybeSingle();
    if (!missionDef?.id) continue;
    const recomputed = metrics.qualifiedReferrals;
    await upsertMissionProgress(supabase, {
      partnerId,
      mission: missionDef,
      currentValue: recomputed,
      periodKey: progress.period_key || "",
    });
  }

  await buildLeaderboardSnapshot(supabase, { rankingMetric: "confirmed_revenue" });

  const reconciliation = await reconcileMetricsCache(supabase, partnerId);

  logPartnerCenterEvent("growth.refund_processed", {
    partnerId,
    referralId,
    reversals: reversals.length,
    metrics: metrics.qualifiedReferrals,
  });

  return { processed: true, reversals, metrics, reconciliation };
}

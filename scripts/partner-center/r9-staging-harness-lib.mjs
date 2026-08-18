/**
 * Round 9 staging validation — shared harness utilities (STAGING ONLY).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import {
  assertStagingGuard as r8AssertStagingGuard,
  serviceClient as r8ServiceClient,
  runStagingSql,
  ensureUser,
  signInJwt,
  ensureIamRole,
  assignRole,
  restoreIamSnapshot,
  partnerBalances,
  snapshotFinancialBaseline,
  captureRunStartedAt,
  FIXTURE_DOMAIN,
  getR8FixtureDomain,
  ensureValidationIamReferenceBaseline,
  purgeOrphanAuthIdentitiesForHarnessPatterns,
} from "./r8-staging-harness-lib.mjs";
import {
  mapWizardPayloadToCampaignInput,
  resolveCampaignDashboardBucket,
  enrichCampaignsForAdmin,
  adminCampaignAction,
  adminCreateCampaignWithMissions,
} from "../../lib/partner-center/admin-marketing-service.js";
import { getPartnerCampaignsView } from "../../lib/partner-center/partner-ui-service.js";

export const R9_DEV_PORT = 3025;
export const R9_FIXTURE_TAG = "r9-staging";

export function assertStagingGuard() {
  process.env.PARTNER_GROWTH_ENGINE = "true";
  process.env.NEXT_PUBLIC_PARTNER_GROWTH_ENGINE = "true";
  process.env.PARTNER_ADMIN_MARKETING = "true";
  process.env.NEXT_PUBLIC_PARTNER_ADMIN_MARKETING = "true";
  return r8AssertStagingGuard();
}

export function serviceClient() {
  return r8ServiceClient();
}

export function getR9FixtureDomain() {
  return getR8FixtureDomain();
}

export async function runR9FixturePreflight(service, runId) {
  const iamReference = await ensureValidationIamReferenceBaseline(service);
  await purgeOrphanAuthIdentitiesForHarnessPatterns().catch(() => null);

  const requiredPermissions = ["partners.campaigns.read", "partners.campaigns.manage", "dashboard.read"];
  for (const permission_id of requiredPermissions) {
    const { data, error } = await service.from("iam_permissions").select("id").eq("id", permission_id).maybeSingle();
    if (error) throw new Error(`R9_IAM_FIXTURE_PREFLIGHT_FAILED:permission_lookup:${permission_id}:${error.message}`);
    if (!data?.id) {
      throw new Error(`R9_IAM_FIXTURE_PREFLIGHT_FAILED:missing_permission:${permission_id}`);
    }
  }

  await ensureIamRole(service, "r9_campaigns_read_probe", "R9 Campaigns Read Probe", [
    "dashboard.read",
    "partners.campaigns.read",
  ]);
  await ensureIamRole(service, "r9_campaigns_manage_probe", "R9 Campaigns Manage Probe", [
    "dashboard.read",
    "partners.campaigns.read",
    "partners.campaigns.manage",
  ]);

  const { count: readBindings } = await service
    .from("iam_role_permissions")
    .select("permission_id", { count: "exact", head: true })
    .eq("role_id", "r9_campaigns_read_probe")
    .eq("permission_id", "partners.campaigns.read");
  if (!readBindings) {
    throw new Error("R9_IAM_FIXTURE_PREFLIGHT_FAILED:role_permission_binding_missing");
  }

  await service.from("iam_role_permissions").delete().eq("role_id", "r9_campaigns_read_probe");
  await service.from("iam_role_permissions").delete().eq("role_id", "r9_campaigns_manage_probe");
  await service.from("iam_roles").delete().eq("id", "r9_campaigns_read_probe");
  await service.from("iam_roles").delete().eq("id", "r9_campaigns_manage_probe");

  return {
    ok: true,
    verdict: "R9_IAM_FIXTURE_PREFLIGHT_PASS",
    runId,
    iamReference,
    requiredPermissions,
  };
}

export async function initR9FixturePool(service, runId) {
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
  const tag = `r9_${runId}`;
  const domain = getR9FixtureDomain();
  const emails = {
    superAdmin: `r9-super-admin@${domain}`,
    campaignsManage: `r9-campaigns-manage@${domain}`,
    campaignsRead: `r9-campaigns-read@${domain}`,
    partnerA: `r9-partner-a@${domain}`,
    partnerB: `r9-partner-b@${domain}`,
    unauthorized: `r9-unauthorized@${domain}`,
  };

  await ensureValidationIamReferenceBaseline(service);
  await purgeOrphanAuthIdentitiesForHarnessPatterns().catch(() => null);

  const meta = { r9_fixture: true, run_id: runId };
  const superAdminId = await ensureUser(service, emails.superAdmin, password, meta);
  const campaignsManageId = await ensureUser(service, emails.campaignsManage, password, meta);
  const campaignsReadId = await ensureUser(service, emails.campaignsRead, password, meta);
  const partnerAUserId = await ensureUser(service, emails.partnerA, password, meta);
  const partnerBUserId = await ensureUser(service, emails.partnerB, password, meta);
  const unauthorizedId = await ensureUser(service, emails.unauthorized, password, meta);

  await service.from("profiles").upsert([
    { id: superAdminId, email: emails.superAdmin, role: "admin" },
    { id: campaignsManageId, email: emails.campaignsManage, role: "user" },
    { id: campaignsReadId, email: emails.campaignsRead, role: "user" },
    { id: partnerAUserId, email: emails.partnerA, role: "user" },
    { id: partnerBUserId, email: emails.partnerB, role: "user" },
  ]);

  await ensureIamRole(service, "r9_campaigns_read", "R9 Campaigns Read", [
    "dashboard.read",
    "partners.campaigns.read",
  ]);
  await ensureIamRole(service, "r9_campaigns_manage", "R9 Campaigns Manage", [
    "dashboard.read",
    "partners.campaigns.read",
    "partners.campaigns.manage",
  ]);

  const iamSnapshot = { assignmentsByUser: {} };
  await assignRole(service, superAdminId, "admin", iamSnapshot);
  await assignRole(service, campaignsManageId, "r9_campaigns_manage", iamSnapshot);
  await assignRole(service, campaignsReadId, "r9_campaigns_read", iamSnapshot);

  const mkPartner = async (userId, code) => {
    const { data, error } = await service
      .from("partners")
      .insert({ user_id: userId, referral_code: code, status: "active", tier_key: "partner" })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const ex = await service.from("partners").select("id").eq("user_id", userId).single();
      return ex.data.id;
    }
    if (error) throw error;
    return data.id;
  };

  const partnerAId = await mkPartner(partnerAUserId, `R9A${runId.slice(-6)}`);
  const partnerBId = await mkPartner(partnerBUserId, `R9B${runId.slice(-6)}`);

  return {
    runId,
    tag,
    password,
    emails,
    iamSnapshot,
    superAdminId,
    campaignsManageId,
    campaignsReadId,
    partnerAUserId,
    partnerBUserId,
    unauthorizedId,
    partnerAId,
    partnerBId,
    cleanupIds: {
      campaignCodes: [],
      campaignIds: [],
      missionCodes: [],
      partnerIds: [partnerAId, partnerBId],
    },
  };
}

export function mkCampaignWizardPayload(runId, suffix = "1") {
  const tag = crypto
    .createHash("sha256")
    .update(`${runId}:${suffix}`)
    .digest("hex")
    .slice(0, 14);
  const code = `r9${tag}`.slice(0, 32);
  const start = new Date(Date.now() + 3600_000);
  const end = new Date(Date.now() + 7 * 86400_000);
  return {
    wizard: true,
    code,
    name_ar: `حملة R9 ${suffix}`,
    description: "R9 staging campaign",
    landing_path: "/register",
    audience_mode: "all",
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    max_exposure_usd: 100,
    reward: { mode: "fixed_percent", percent: 12, stacking_allowed: false },
    missions: [
      {
        code: `${code}_M1`,
        name_ar: "مهمة إحالة",
        mission_type: "qualified_referrals_count",
        target_metric: "qualified_referrals",
        target_value: 2,
        reward_amount: 5,
      },
    ],
  };
}

export async function createR9Campaign(service, actorUserId, runId, suffix = "1") {
  const payload = mkCampaignWizardPayload(runId, suffix);
  const result = await adminCreateCampaignWithMissions(service, payload, actorUserId);
  return { ...result, payload };
}

export async function cleanupR9Fixtures(service, fx, runStartedAt = null) {
  const like = `%${fx.runId}%`;
  const ids = fx.cleanupIds?.campaignIds || [];
  const partnerIds = fx.cleanupIds?.partnerIds || [];
  const userIds = [
    fx.superAdminId,
    fx.campaignsManageId,
    fx.campaignsReadId,
    fx.partnerAUserId,
    fx.partnerBUserId,
    fx.unauthorizedId,
  ].filter(Boolean);

  if (ids.length) {
    await service.from("partner_mission_definitions").delete().in("campaign_program_id", ids);
    try {
      await service.from("partner_campaign_participants").delete().in("campaign_id", ids);
    } catch { /* optional table/column */ }
    await service.from("partner_campaign_programs").delete().in("id", ids);
  }
  await service.from("partner_campaign_programs").delete().filter("code", "like", `r9%`);
  await service.from("partner_mission_definitions").delete().filter("code", "like", `r9%`);
  try {
    await service.from("partner_admin_audit_log").delete().filter("reason", "like", like);
  } catch { /* optional */ }

  for (const uid of userIds) {
    await service.from("iam_user_assignments").delete().eq("user_id", uid);
  }
  for (const roleId of ["r9_campaigns_read", "r9_campaigns_manage"]) {
    await service.from("iam_role_permissions").delete().eq("role_id", roleId);
    await service.from("iam_roles").delete().eq("id", roleId);
  }

  if (runStartedAt && partnerIds.length) {
    runStagingSql(
      `SELECT public.partner_center_staging_purge_run_commissions(ARRAY[${partnerIds.map((id) => `'${id}'::uuid`).join(",")}]::uuid[], '${runStartedAt}'::timestamptz);`,
      { optional: true }
    );
  }

  if (process.env.HV_VALIDATION_TARGET === "isolated") {
    const { purgeIsolatedHarnessBusinessResidue } = await import("../hv-pass3-pregate-cleanup-lib.mjs");
    await purgeIsolatedHarnessBusinessResidue(service, { userIds, partnerIds });
  } else if (partnerIds.length) {
    await service.from("partners").delete().in("id", partnerIds);
  }

  for (const uid of userIds) {
    await service.from("profiles").delete().eq("id", uid);
    await service.auth.admin.deleteUser(uid).catch(() => null);
  }
  await purgeOrphanAuthIdentitiesForHarnessPatterns().catch(() => null);
}

export async function campaignsAdminApi(base, cookie, method, body, query = "") {
  const res = await fetch(`${base}/api/admin/partner-marketing/campaigns${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, ok: res.ok };
}

export {
  crypto,
  runStagingSql,
  signInJwt,
  restoreIamSnapshot,
  partnerBalances,
  snapshotFinancialBaseline,
  captureRunStartedAt,
  mapWizardPayloadToCampaignInput,
  resolveCampaignDashboardBucket,
  enrichCampaignsForAdmin,
  adminCampaignAction,
  adminCreateCampaignWithMissions,
  getPartnerCampaignsView,
  FIXTURE_DOMAIN,
  ensureValidationIamReferenceBaseline,
};

export function writeManifestArtifact(runId, report) {
  const dir = join(process.cwd(), "scripts/partner-center/.artifacts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `r9-manifest-${runId}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

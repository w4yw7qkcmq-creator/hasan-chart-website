import { logPartnerCenterEvent } from "./observability.js";

export async function recordPartnerAdminAudit(supabase, {
  actorUserId,
  action,
  entityType,
  entityId,
  beforeState = null,
  afterState = null,
  reason = null,
}) {
  const { data, error } = await supabase
    .from("partner_admin_audit_log")
    .insert({
      actor_user_id: actorUserId,
      action,
      entity_type: entityType,
      entity_id: String(entityId),
      before_state: beforeState,
      after_state: afterState,
      reason,
    })
    .select("id")
    .single();
  if (error) throw error;

  logPartnerCenterEvent("admin.audit", { action, entityType, entityId });
  return { auditId: data.id };
}

export async function createMissionDefinition(supabase, input, actorUserId) {
  const { data, error } = await supabase
    .from("partner_mission_definitions")
    .insert({ ...input, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;
  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create",
    entityType: "mission",
    entityId: data.id,
    afterState: data,
  });
  return data;
}

export async function createCampaignProgram(supabase, input, actorUserId) {
  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .insert({ ...input, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;
  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create",
    entityType: "campaign_program",
    entityId: data.id,
    afterState: data,
  });
  return data;
}

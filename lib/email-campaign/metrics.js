import { getCampaignById } from "./store.js";

const RECIPIENTS_TABLE = "email_campaign_recipients";

export async function fetchCampaignDetail(supabase, campaignId, { recipientPage = 1, recipientPageSize = 50 } = {}) {
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign) return null;

  const safePage = Math.max(Number(recipientPage) || 1, 1);
  const safeSize = Math.min(Math.max(Number(recipientPageSize) || 50, 1), 200);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const { data: recipients, count, error } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("id, email, eligibility_status, eligibility_reason, delivery_status, outbox_id, error, updated_at", {
      count: "exact",
    })
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message || "Failed to load campaign recipients");

  const { data: statusRows } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("delivery_status")
    .eq("campaign_id", campaignId);

  const deliveryBreakdown = {};
  for (const row of statusRows || []) {
    deliveryBreakdown[row.delivery_status] = (deliveryBreakdown[row.delivery_status] || 0) + 1;
  }

  return {
    campaign,
    recipients: recipients || [],
    recipientsTotal: count || 0,
    recipientPage: safePage,
    recipientPageSize: safeSize,
    deliveryBreakdown,
  };
}

export async function fetchOperationsOverview(supabase) {
  const [{ count: activeCampaigns }, { count: pendingOutbox }] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select("id", { count: "exact", head: true })
      .in("status", ["sending", "paused", "ready"]),
    supabase
      .from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    activeCampaigns: activeCampaigns || 0,
    pendingOutbox: pendingOutbox || 0,
  };
}

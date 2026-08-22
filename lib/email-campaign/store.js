import { CAMPAIGN_STATUS, canEditCampaignContent } from "./constants.js";
import { sanitizeCampaignHtml } from "./renderer.js";

const CAMPAIGNS_TABLE = "email_campaigns";

export function mapCampaignRow(row) {
  if (!row) return null;
  return row;
}

export async function listCampaigns(
  supabase,
  { page = 1, pageSize = 20, status = null, createdBy = null } = {}
) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  let query = supabase
    .from(CAMPAIGNS_TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (createdBy) {
    query = query.eq("created_by", createdBy);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || "Failed to list campaigns");

  return {
    rows: data || [],
    total: count || 0,
    page: safePage,
    pageSize: safeSize,
  };
}

export async function getCampaignById(supabase, campaignId) {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load campaign");
  return data;
}

export async function createCampaignDraft(
  supabase,
  {
    name,
    subject = "",
    previewText = "",
    htmlContent = "",
    textContent = "",
    audienceType = "all_eligible",
    audienceFilter = {},
    createdBy = null,
  } = {}
) {
  const row = {
    name: String(name || "").trim(),
    subject: String(subject || "").trim(),
    preview_text: String(previewText || "").trim() || null,
    html_content: sanitizeCampaignHtml(htmlContent || ""),
    text_content: textContent ? String(textContent) : null,
    audience_type: String(audienceType || "all_eligible").trim(),
    audience_filter: audienceFilter || {},
    status: CAMPAIGN_STATUS.DRAFT,
    created_by: createdBy,
    category: "marketing",
  };

  if (!row.name) {
    throw new Error("Campaign name is required");
  }

  const { data, error } = await supabase.from(CAMPAIGNS_TABLE).insert(row).select("*").single();
  if (error) throw new Error(error.message || "Failed to create campaign");
  return data;
}

export async function updateCampaignDraft(supabase, campaignId, patch = {}) {
  const existing = await getCampaignById(supabase, campaignId);
  if (!existing) {
    throw new Error("Campaign not found");
  }

  if (!canEditCampaignContent(existing.status)) {
    throw new Error("Campaign content is locked after launch");
  }

  const updates = { updated_at: new Date().toISOString() };

  if (patch.name !== undefined) updates.name = String(patch.name || "").trim();
  if (patch.subject !== undefined) updates.subject = String(patch.subject || "").trim();
  if (patch.previewText !== undefined) {
    updates.preview_text = String(patch.previewText || "").trim() || null;
  }
  if (patch.htmlContent !== undefined) {
    updates.html_content = sanitizeCampaignHtml(patch.htmlContent || "");
  }
  if (patch.textContent !== undefined) {
    updates.text_content = patch.textContent ? String(patch.textContent) : null;
  }
  if (patch.audienceType !== undefined) {
    updates.audience_type = String(patch.audienceType || "").trim();
  }
  if (patch.audienceFilter !== undefined) {
    updates.audience_filter = patch.audienceFilter || {};
  }

  // E3: bulk campaigns are always marketing — client cannot downgrade to transactional.
  if (patch.category !== undefined) {
    const requested = String(patch.category || "").trim().toLowerCase();
    if (requested !== "marketing" && requested !== "bulk") {
      throw new Error("Campaign category cannot bypass marketing consent policy");
    }
  }

  updates.category = "marketing";

  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update(updates)
    .eq("id", campaignId)
    .select("*")
    .single();

  if (error) throw new Error(error.message || "Failed to update campaign");
  return data;
}

export async function cloneCampaignAsDraft(supabase, campaignId, createdBy = null) {
  const source = await getCampaignById(supabase, campaignId);
  if (!source) throw new Error("Campaign not found");

  return createCampaignDraft(supabase, {
    name: `${source.name} (copy)`,
    subject: source.subject,
    previewText: source.preview_text,
    htmlContent: source.html_content,
    textContent: source.text_content,
    audienceType: source.audience_type,
    audienceFilter: source.audience_filter,
    createdBy,
  });
}

import { partnerLogger } from "./partner-logger";
import { writePartnerAuditLog } from "./partner-monitoring";

export const DEFAULT_PARTNER_TIER_KEY = "partner";
export const DEFAULT_PARTNER_TIER_PERCENT = 10;

export const DEFAULT_PARTNER_TIERS = [
  {
    tier_key: "partner",
    tier_name: "Partner",
    commission_percent: 10,
    min_active_referrals: 0,
    min_total_sales: 0,
    is_active: true,
    sort_order: 1,
  },
  {
    tier_key: "silver",
    tier_name: "Silver",
    commission_percent: 15,
    min_active_referrals: 3,
    min_total_sales: 100,
    is_active: true,
    sort_order: 2,
  },
  {
    tier_key: "gold",
    tier_name: "Gold",
    commission_percent: 20,
    min_active_referrals: 10,
    min_total_sales: 500,
    is_active: true,
    sort_order: 3,
  },
  {
    tier_key: "platinum",
    tier_name: "Platinum",
    commission_percent: 25,
    min_active_referrals: 25,
    min_total_sales: 1500,
    is_active: true,
    sort_order: 4,
  },
  {
    tier_key: "diamond",
    tier_name: "Diamond",
    commission_percent: 30,
    min_active_referrals: 50,
    min_total_sales: 5000,
    is_active: true,
    sort_order: 5,
  },
];

const APPROVED_SALES_STATUSES = new Set(["approved", "withdrawable", "paid"]);

const ACTIVE_REFERRAL_COMMISSION_STATUSES = new Set([
  "approved",
  "withdrawable",
  "paid",
  "pending",
  "pending_activation",
]);

function normalizeTier(row) {
  return {
    tier_key: String(row?.tier_key || DEFAULT_PARTNER_TIER_KEY).toLowerCase(),
    tier_name: row?.tier_name || "Partner",
    commission_percent: Number(row?.commission_percent ?? DEFAULT_PARTNER_TIER_PERCENT),
    min_active_referrals: Number(row?.min_active_referrals || 0),
    min_total_sales: Number(row?.min_total_sales || 0),
    is_active: row?.is_active ?? true,
    sort_order: Number(row?.sort_order || 1),
  };
}

export async function loadPartnerTiers(supabase) {
  const { data, error } = await supabase
    .from("partner_tiers")
    .select(
      "tier_key, tier_name, commission_percent, min_active_referrals, min_total_sales, is_active, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return DEFAULT_PARTNER_TIERS.map(normalizeTier);
  }

  return data.map(normalizeTier);
}

export async function countActivePartnerReferrals(supabase, partnerId) {
  const normalizedPartnerId = String(partnerId || "").trim();

  if (!normalizedPartnerId) {
    return 0;
  }

  const [referralsResult, commissionsResult] = await Promise.all([
    supabase
      .from("partner_referrals")
      .select("id, status")
      .eq("partner_id", normalizedPartnerId),
    supabase
      .from("partner_commissions")
      .select("referral_id, service_type, status")
      .eq("partner_id", normalizedPartnerId)
      .neq("service_type", "registration"),
  ]);

  if (referralsResult.error) {
    throw referralsResult.error;
  }

  if (commissionsResult.error) {
    throw commissionsResult.error;
  }

  const qualifyingReferralIds = new Set();

  for (const row of commissionsResult.data || []) {
    if (
      row.referral_id &&
      ACTIVE_REFERRAL_COMMISSION_STATUSES.has(String(row.status || "").trim())
    ) {
      qualifyingReferralIds.add(row.referral_id);
    }
  }

  const activeReferralIds = new Set();

  for (const referral of referralsResult.data || []) {
    if (referral.status === "active" || qualifyingReferralIds.has(referral.id)) {
      activeReferralIds.add(referral.id);
    }
  }

  return activeReferralIds.size;
}

export async function getPartnerTierByKey(supabase, tierKey) {
  const key = String(tierKey || DEFAULT_PARTNER_TIER_KEY).toLowerCase();
  const tiers = await loadPartnerTiers(supabase);
  return tiers.find((tier) => tier.tier_key === key) || tiers[0] || normalizeTier(DEFAULT_PARTNER_TIERS[0]);
}

export async function computePartnerApprovedSales(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_commissions")
    .select("base_amount, amount, service_type, status")
    .eq("partner_id", partnerId)
    .neq("service_type", "registration");

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, row) => {
    if (!APPROVED_SALES_STATUSES.has(row.status)) {
      return sum;
    }

    const baseAmount = Number(row.base_amount || 0);
    const fallbackAmount = Number(row.amount || 0);
    return sum + (baseAmount > 0 ? baseAmount : fallbackAmount);
  }, 0);
}

export async function resolvePartnerCommissionPercent(supabase, partnerId) {
  const { data: partner, error } = await supabase
    .from("partners")
    .select("tier_key")
    .eq("id", partnerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const tier = await getPartnerTierByKey(supabase, partner?.tier_key || DEFAULT_PARTNER_TIER_KEY);
  return Number(tier.commission_percent || DEFAULT_PARTNER_TIER_PERCENT);
}

export async function evaluatePartnerTier(supabase, partnerId) {
  const normalizedPartnerId = String(partnerId || "").trim();

  if (!normalizedPartnerId) {
    return { upgraded: false, reason: "missing_partner_id" };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, tier_key, active_account_count")
    .eq("id", normalizedPartnerId)
    .maybeSingle();

  if (partnerError) {
    throw partnerError;
  }

  if (!partner?.id) {
    return { upgraded: false, reason: "partner_not_found" };
  }

  const tiers = await loadPartnerTiers(supabase);
  const currentTier =
    tiers.find((tier) => tier.tier_key === String(partner.tier_key || DEFAULT_PARTNER_TIER_KEY).toLowerCase()) ||
    tiers[0];

  const activeReferrals = await countActivePartnerReferrals(supabase, partner.id);
  const totalSales = await computePartnerApprovedSales(supabase, partner.id);

  let qualifiedTier = currentTier;

  for (const tier of [...tiers].sort((a, b) => b.sort_order - a.sort_order)) {
    if (
      activeReferrals >= tier.min_active_referrals &&
      totalSales >= tier.min_total_sales
    ) {
      qualifiedTier = tier;
      break;
    }
  }

  if (qualifiedTier.sort_order <= currentTier.sort_order) {
    return {
      upgraded: false,
      reason: "no_upgrade",
      tierKey: currentTier.tier_key,
      tierName: currentTier.tier_name,
      commissionPercent: currentTier.commission_percent,
      activeReferrals,
      totalSales,
    };
  }

  const now = new Date().toISOString();

  const { data: updatedPartner, error: updateError } = await supabase
    .from("partners")
    .update({
      tier_key: qualifiedTier.tier_key,
      tier_updated_at: now,
      updated_at: now,
    })
    .eq("id", partner.id)
    .select("id, tier_key, tier_updated_at")
    .single();

  if (updateError) {
    throw updateError;
  }

  partnerLogger.upgrade("completed", {
    partnerId: partner.id,
    fromTierKey: currentTier.tier_key,
    toTierKey: qualifiedTier.tier_key,
  });

  await writePartnerAuditLog("tier.upgraded", {
    partnerId: partner.id,
    fromTierKey: currentTier.tier_key,
    toTierKey: qualifiedTier.tier_key,
  });

  return {
    upgraded: true,
    fromTierKey: currentTier.tier_key,
    toTierKey: qualifiedTier.tier_key,
    tierKey: qualifiedTier.tier_key,
    tierName: qualifiedTier.tier_name,
    commissionPercent: qualifiedTier.commission_percent,
    activeReferrals,
    totalSales,
    partner: updatedPartner,
  };
}

export async function getPartnerTierProgress(supabase, partnerId) {
  const normalizedPartnerId = String(partnerId || "").trim();

  if (!normalizedPartnerId) {
    return null;
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, tier_key, tier_updated_at, active_account_count")
    .eq("id", normalizedPartnerId)
    .maybeSingle();

  if (partnerError) {
    throw partnerError;
  }

  if (!partner?.id) {
    return null;
  }

  const tiers = await loadPartnerTiers(supabase);
  const currentTier =
    tiers.find((tier) => tier.tier_key === String(partner.tier_key || DEFAULT_PARTNER_TIER_KEY).toLowerCase()) ||
    tiers[0];
  const nextTier = tiers.find((tier) => tier.sort_order === currentTier.sort_order + 1) || null;

  const activeReferrals = await countActivePartnerReferrals(supabase, partner.id);
  const totalSales = await computePartnerApprovedSales(supabase, partner.id);

  return {
    tierKey: currentTier.tier_key,
    tierName: currentTier.tier_name,
    commissionPercent: currentTier.commission_percent,
    tierUpdatedAt: partner.tier_updated_at,
    activeReferrals,
    totalSales,
    nextTier: nextTier
      ? {
          tierKey: nextTier.tier_key,
          tierName: nextTier.tier_name,
          commissionPercent: nextTier.commission_percent,
          minActiveReferrals: nextTier.min_active_referrals,
          minTotalSales: nextTier.min_total_sales,
          activeReferralsProgress: Math.min(
            100,
            nextTier.min_active_referrals > 0
              ? Math.round((activeReferrals / nextTier.min_active_referrals) * 100)
              : 100
          ),
          totalSalesProgress: Math.min(
            100,
            nextTier.min_total_sales > 0
              ? Math.round((totalSales / nextTier.min_total_sales) * 100)
              : 100
          ),
        }
      : null,
  };
}

export function tierNameLabel(tierKey) {
  const map = {
    partner: "Partner",
    silver: "Silver",
    gold: "Gold",
    platinum: "Platinum",
    diamond: "Diamond",
  };

  return map[String(tierKey || "").toLowerCase()] || tierKey || "Partner";
}

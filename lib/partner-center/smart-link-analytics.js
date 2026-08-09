import { QUALIFICATION_STATES } from "./constants.js";
import { roundMoney } from "./money.js";
import { safePercent } from "./ui-labels.js";

/**
 * Server-side per-link metrics — source of truth from attribution tables.
 */
export async function computeSmartLinkMetricsForPartner(supabase, partnerId, smartLinkIds = []) {
  if (!smartLinkIds.length) return new Map();

  const ids = [...new Set(smartLinkIds.filter(Boolean))];
  const result = new Map(ids.map((id) => [id, emptyMetrics()]));

  const [{ data: sessions }, { data: attributions }] = await Promise.all([
    supabase
      .from("partner_attribution_sessions")
      .select("smart_link_id")
      .eq("partner_id", partnerId)
      .in("smart_link_id", ids),
    supabase
      .from("partner_referral_attributions")
      .select("id, referral_id, smart_link_id")
      .eq("partner_id", partnerId)
      .in("smart_link_id", ids),
  ]);

  for (const row of sessions || []) {
    if (!row.smart_link_id) continue;
    const m = result.get(row.smart_link_id) || emptyMetrics();
    m.clicks += 1;
    result.set(row.smart_link_id, m);
  }

  const referralIds = (attributions || []).map((a) => a.referral_id).filter(Boolean);
  const attrByReferral = new Map((attributions || []).map((a) => [a.referral_id, a.smart_link_id]));

  for (const attr of attributions || []) {
    if (!attr.smart_link_id) continue;
    const m = result.get(attr.smart_link_id) || emptyMetrics();
    m.signups += 1;
    result.set(attr.smart_link_id, m);
  }

  if (referralIds.length) {
    const { data: quals } = await supabase
      .from("partner_referral_qualifications")
      .select("referral_id, state")
      .eq("partner_id", partnerId)
      .in("referral_id", referralIds);

    for (const q of quals || []) {
      const linkId = attrByReferral.get(q.referral_id);
      if (!linkId) continue;
      const m = result.get(linkId) || emptyMetrics();
      if (q.state === QUALIFICATION_STATES.QUALIFIED) m.qualified += 1;
      if (q.state === QUALIFICATION_STATES.CUSTOMER) m.customers += 1;
      result.set(linkId, m);
    }

    const { data: commissions } = await supabase
      .from("partner_commissions")
      .select("referral_id, amount")
      .eq("partner_id", partnerId)
      .neq("status", "rejected")
      .in("referral_id", referralIds);

    for (const entry of commissions || []) {
      const linkId = attrByReferral.get(entry.referral_id);
      if (!linkId) continue;
      const m = result.get(linkId) || emptyMetrics();
      m.confirmedRevenue = roundMoney(m.confirmedRevenue + Number(entry.amount || 0));
      result.set(linkId, m);
    }
  }

  for (const [id, m] of result) {
    m.conversionRate = safePercent(m.customers, m.clicks);
    m.funnel = {
      clicks: m.clicks,
      signups: m.signups,
      qualified: m.qualified,
      customers: m.customers,
      conversionRates: {
        clickToSignup: safePercent(m.signups, m.clicks),
        signupToQualified: safePercent(m.qualified, m.signups),
        qualifiedToCustomer: safePercent(m.customers, m.qualified),
      },
    };
    result.set(id, m);
  }

  return result;
}

export async function computePartnerAggregateFromLinks(linkMetricsMap) {
  const agg = emptyMetrics();
  for (const m of linkMetricsMap.values()) {
    agg.clicks += m.clicks;
    agg.signups += m.signups;
    agg.qualified += m.qualified;
    agg.customers += m.customers;
    agg.confirmedRevenue = roundMoney(agg.confirmedRevenue + m.confirmedRevenue);
  }
  agg.conversionRate = safePercent(agg.customers, agg.clicks);
  return agg;
}

function emptyMetrics() {
  return {
    clicks: 0,
    signups: 0,
    qualified: 0,
    customers: 0,
    confirmedRevenue: 0,
    conversionRate: 0,
    funnel: null,
  };
}

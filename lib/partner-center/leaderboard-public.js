export const LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  "email",
  "userId",
  "partnerId",
  "partner_id",
  "referralCode",
  "referral_code",
  "totalEarnings",
  "totalCommissions",
  "totalSales",
  "total_sales",
  "username",
  "phone",
  "fraudStatus",
  "classification",
  "riskLevel",
  "humanVerificationStatus",
]);

export function maskPartnerDisplayLabel(referralCode = "") {
  const prefix = String(referralCode || "").slice(0, 4).toUpperCase();
  return prefix ? `Partner ${prefix}***` : "Partner ****";
}

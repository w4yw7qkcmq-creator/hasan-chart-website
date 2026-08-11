"use client";

export default function PartnerAdminBadge({ children, tone = "neutral", className = "" }) {
  return (
    <span className={`pa-badge pa-badge--${tone} ${className}`.trim()}>{children}</span>
  );
}

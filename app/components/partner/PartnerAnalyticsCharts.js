"use client";
import {
  formatPartnerMoney,
  serviceTypeLabel,
} from "../../../lib/partner-shared";
function maxValue(items, key = "amount") {
  return (
    items.reduce((max, item) => Math.max(max, Number(item[key] || 0)), 0) || 1
  );
}
export function PartnerBarChart({
  items,
  labelKey = "label",
  valueKey = "amount",
  formatValue,
}) {
  const peak = maxValue(items, valueKey);
  const formatter = formatValue || ((value) => String(value));
  if (!items?.length) {
    return (
      <p className="text-sm ui-text-subtle">
        لا توجد بيانات كافية للرسم البياني.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {" "}
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max(4, Math.round((value / peak) * 100));
        return (
          <div
            key={`${item[labelKey]}-${value}`}
            className="grid grid-cols-[88px_1fr_auto] items-center gap-3"
          >
            {" "}
            <span className="truncate text-xs ui-text-muted">
              {item[labelKey]}
            </span>{" "}
            <div className="h-3 overflow-hidden rounded-full ui-glass-10">
              {" "}
              <div
                className="h-full rounded-full admin-panel"
                style={{ width: `${width}%` }}
              />{" "}
            </div>{" "}
            <span className="text-xs font-bold admin-text-muted">
              {formatter(value)}
            </span>{" "}
          </div>
        );
      })}{" "}
    </div>
  );
}
export function PartnerLineChart({
  items,
  labelKey = "date",
  valueKey = "amount",
  formatValue,
}) {
  const formatter = formatValue || ((value) => String(value));
  if (!items?.length) {
    return (
      <p className="text-sm ui-text-subtle">
        لا توجد بيانات كافية للرسم البياني.
      </p>
    );
  }
  const values = items.map((item) => Number(item[valueKey] || 0));
  const peak = Math.max(...values, 1);
  const width = 640;
  const height = 180;
  const step = items.length > 1 ? width / (items.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / peak) * (height - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="overflow-x-auto">
      {" "}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full min-w-[320px] admin-text-muted"
      >
        {" "}
        <defs>
          {" "}
          <linearGradient id="partnerLineFill" x1="0" y1="0" x2="0" y2="1">
            {" "}
            <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />{" "}
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />{" "}
          </linearGradient>{" "}
        </defs>{" "}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />{" "}
        <polygon
          fill="url(#partnerLineFill)"
          points={`0,${height} ${points} ${width},${height}`}
        />{" "}
      </svg>{" "}
      <div className="mt-2 flex flex-wrap gap-2">
        {" "}
        {items.slice(-6).map((item) => (
          <span
            key={item[labelKey]}
            className="rounded-full border admin-panel-border px-2 py-1 text-[11px] ui-text-muted"
          >
            {" "}
            {item[labelKey]}: {formatter(Number(item[valueKey] || 0))}{" "}
          </span>
        ))}{" "}
      </div>{" "}
    </div>
  );
}
export function PartnerServiceBreakdownChart({ items }) {
  const mapped = (items || []).map((item) => ({
    label: serviceTypeLabel(item.serviceType),
    amount: Number(item.amount || 0),
  }));
  return (
    <PartnerBarChart
      items={mapped}
      labelKey="label"
      valueKey="amount"
      formatValue={(v) => formatPartnerMoney(v)}
    />
  );
}
export function PartnerMonthlyComparisonChart({ items }) {
  const mapped = (items || []).map((item) => ({
    label: item.month,
    amount: Number(item.commissions || 0),
    sales: Number(item.sales || 0),
    newCustomers: Number(item.newCustomers || 0),
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {" "}
      <div>
        {" "}
        <p className="mb-3 text-sm font-bold admin-text-muted">
          العمولات الشهرية
        </p>{" "}
        <PartnerBarChart
          items={mapped}
          labelKey="label"
          valueKey="amount"
          formatValue={(v) => formatPartnerMoney(v)}
        />{" "}
      </div>{" "}
      <div>
        {" "}
        <p className="mb-3 text-sm font-bold admin-text-muted">
          المبيعات الشهرية
        </p>{" "}
        <PartnerBarChart
          items={mapped}
          labelKey="label"
          valueKey="sales"
          formatValue={(v) => formatPartnerMoney(v)}
        />{" "}
      </div>{" "}
    </div>
  );
}

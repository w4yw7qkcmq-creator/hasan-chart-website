export const PAYMENT_NETWORKS = {
  TRC20: {
    label: "TRC 20",
    address: "TDaNDYL8BzM6whvcX6nQkz2MSGMKwpXnBE",
  },
  BEP20: {
    label: "BEP 20",
    address: "0x5088c78d5e53da45a3eb930f26462e2a76eb389d",
  },
};

export const PAYMENT_NETWORK_VALUES = Object.freeze(Object.keys(PAYMENT_NETWORKS));

export const PAYMENT_NETWORK_OPTIONS = PAYMENT_NETWORK_VALUES.map((value) => ({
  value,
  label: PAYMENT_NETWORKS[value].label,
  address: PAYMENT_NETWORKS[value].address,
}));

export function normalizePaymentNetwork(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");

  if (raw === "TRC20") return "TRC20";
  if (raw === "BEP20") return "BEP20";
  return null;
}

export function validatePaymentNetwork(value) {
  const normalized = normalizePaymentNetwork(value);

  if (!normalized || !PAYMENT_NETWORK_VALUES.includes(normalized)) {
    return {
      ok: false,
      error: "نوع الشبكة غير صالح. يرجى اختيار TRC 20 أو BEP 20.",
      code: "INVALID_PAYMENT_NETWORK",
    };
  }

  return { ok: true, value: normalized };
}

export function getPaymentNetworkLabel(value) {
  const normalized = normalizePaymentNetwork(value);
  return normalized ? PAYMENT_NETWORKS[normalized].label : "";
}

export function getPaymentNetworkAddress(value) {
  const normalized = normalizePaymentNetwork(value);
  return normalized ? PAYMENT_NETWORKS[normalized].address : "";
}

export function formatPaymentNetworkForAdmin(value) {
  const label = getPaymentNetworkLabel(value);
  return label ? `نوع الشبكة: ${label}` : "";
}

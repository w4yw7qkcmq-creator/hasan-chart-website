/** Money helpers — numeric(12,2) compatible; no floating-point accumulation. */

export function roundMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100) / 100;
}

export function assertPositiveMoney(value, { allowZero = false } = {}) {
  const amount = roundMoney(value);
  if (!Number.isFinite(amount)) {
    throw new Error("INVALID_MONEY");
  }
  if (allowZero ? amount < 0 : amount <= 0) {
    throw new Error("INVALID_MONEY");
  }
  return amount;
}

export function sumLedgerSignedAmounts(entries = []) {
  let total = 0;
  for (const entry of entries) {
    const amount = roundMoney(entry.amount);
    if (entry.entry_direction === "debit") {
      total -= amount;
    } else {
      total += amount;
    }
  }
  return roundMoney(total);
}

export function sumLedgerBucket(entries = [], bucket) {
  return roundMoney(
    sumLedgerSignedAmounts(entries.filter((entry) => entry.balance_bucket === bucket))
  );
}

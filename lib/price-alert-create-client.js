export async function createPriceAlert({
  coin,
  price,
  condition = "above",
  signal,
} = {}) {
  const payload = {
    coin: String(coin || "").trim(),
    price: String(price || "").trim(),
    condition: String(condition || "above").trim(),
  };

  console.log(
    "PRICE_ALERT_CREATE_START",
    JSON.stringify({
      coin: payload.coin,
      price: payload.price,
      condition: payload.condition,
    })
  );

  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    signal,
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);
  const alertId = result?.alert?.id || null;

  if (!response.ok || !result?.success || !alertId) {
    console.error(
      "PRICE_ALERT_CREATE_FAILED",
      JSON.stringify({
        status: response.status,
        success: result?.success ?? null,
        alertId,
        error: result?.error || null,
      })
    );

    throw new Error(result?.error || "فشل إنشاء التنبيه في قاعدة البيانات");
  }

  console.log(
    "PRICE_ALERT_CREATE_SUCCESS",
    JSON.stringify({
      alertId,
      coin: payload.coin,
      price: payload.price,
      condition: result?.alert?.condition || payload.condition,
      status: result?.alert?.status || "active",
    })
  );

  return result;
}

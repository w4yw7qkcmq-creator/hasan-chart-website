"use client";

async function verifyAuthenticatedSession() {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.authenticated || !payload?.user?.email) {
    const error = new Error("يجب تسجيل الدخول أولاً قبل إنشاء تنبيه سعري.");
    error.code = "UNAUTHORIZED";
    throw error;
  }

  return payload.user;
}

export async function createPriceAlert({
  coin,
  price,
  condition = "auto",
  signal,
} = {}) {
  const normalizedCoin = String(coin || "").trim().toUpperCase();
  const normalizedPrice = String(price || "").trim();
  const normalizedCondition = String(condition || "auto").trim();

  if (!normalizedCoin || !normalizedPrice) {
    const error = new Error("العملة والسعر مطلوبان.");
    console.error("PRICE_ALERT_CREATE_FAILED", error);
    throw error;
  }

  const sessionUser = await verifyAuthenticatedSession();

  console.log("PRICE_ALERT_CREATE_START", {
    coin: normalizedCoin,
    price: normalizedPrice,
    condition: normalizedCondition,
    email: sessionUser.email,
  });

  const apiUrl = `${window.location.origin}/api/alerts`;

  let response;

  try {
    response = await window.fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      cache: "no-store",
      signal,
      body: JSON.stringify({
        coin: normalizedCoin,
        price: normalizedPrice,
        condition: normalizedCondition,
      }),
    });
  } catch (error) {
    console.error("PRICE_ALERT_CREATE_FAILED", error);
    throw error;
  }

  const result = await response.json().catch(() => null);
  const alertRow = result?.alert || null;
  const alertId = alertRow?.id || null;

  if (!response.ok || !result?.success || !alertId) {
    const error = new Error(
      result?.error || `فشل إنشاء التنبيه في قاعدة البيانات (${response.status})`
    );
    console.error("PRICE_ALERT_CREATE_FAILED", {
      error,
      status: response.status,
      result,
    });
    throw error;
  }

  console.log("PRICE_ALERT_CREATE_SUCCESS", alertRow);

  return {
    success: true,
    message: result.message,
    alert: alertRow,
  };
}

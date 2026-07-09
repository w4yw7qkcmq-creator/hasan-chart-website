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

async function parseAlertsApiResponse(response) {
  const result = await response.json().catch(() => null);
  return { response, result };
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
    throw new Error("العملة والسعر مطلوبان.");
  }

  await verifyAuthenticatedSession();

  let response;

  try {
    response = await window.fetch(`${window.location.origin}/api/alerts`, {
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
    throw error;
  }

  const { result } = await parseAlertsApiResponse(response);
  const alertRow = result?.alert || null;
  const alertId = alertRow?.id || null;

  if (!response.ok || !result?.success || !alertId) {
    throw new Error(
      result?.error || `فشل إنشاء التنبيه في قاعدة البيانات (${response.status})`
    );
  }

  return {
    success: true,
    message: result.message,
    alert: alertRow,
  };
}

export async function updatePriceAlert({ id, coin, price, signal } = {}) {
  const alertId = String(id || "").trim();
  const normalizedCoin = String(coin || "").trim().toUpperCase();
  const normalizedPrice = String(price || "").trim();

  if (!alertId || !normalizedCoin || !normalizedPrice) {
    throw new Error("معرّف التنبيه والعملة والسعر مطلوبة.");
  }

  await verifyAuthenticatedSession();

  const response = await window.fetch(`${window.location.origin}/api/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
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
    }),
  });

  const { result } = await parseAlertsApiResponse(response);

  if (!response.ok || !result?.success || !result?.alert?.id) {
    throw new Error(result?.error || `فشل تحديث التنبيه (${response.status})`);
  }

  return {
    success: true,
    message: result.message,
    alert: result.alert,
  };
}

export async function deletePriceAlert({ id, signal } = {}) {
  const alertId = String(id || "").trim();

  if (!alertId) {
    throw new Error("معرّف التنبيه مطلوب.");
  }

  await verifyAuthenticatedSession();

  const response = await window.fetch(`${window.location.origin}/api/alerts/${encodeURIComponent(alertId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
    credentials: "include",
    cache: "no-store",
    signal,
  });

  const { result } = await parseAlertsApiResponse(response);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `فشل حذف التنبيه (${response.status})`);
  }

  return {
    success: true,
    message: result.message,
  };
}

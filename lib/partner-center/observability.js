const LOG_PREFIX = "PARTNER_CENTER";

function sanitizeLogPayload(payload = {}) {
  const clean = { ...payload };
  delete clean.token;
  delete clean.accessToken;
  delete clean.refreshToken;
  delete clean.password;
  delete clean.email;
  delete clean.wallet_address;
  delete clean.walletAddress;
  return clean;
}

export function logPartnerCenterEvent(event, payload = {}) {
  console.log(
    LOG_PREFIX,
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...sanitizeLogPayload(payload),
    })
  );
}

export function logPartnerCenterFailure(event, payload = {}) {
  console.error(
    LOG_PREFIX,
    JSON.stringify({
      event,
      level: "error",
      at: new Date().toISOString(),
      ...sanitizeLogPayload(payload),
    })
  );
}

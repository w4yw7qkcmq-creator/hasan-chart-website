export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const POSITIVE_BIGINT_STRING_PATTERN = /^[1-9][0-9]*$/;

function trimIdValue(value) {
  if (value == null) return "";
  return String(value).trim();
}

function buildInvalidIdError({ fieldName, errorCode, message, statusCode = 400 }) {
  const error = new Error(message || `INVALID_${String(fieldName || "id").toUpperCase()}`);
  error.code = errorCode;
  error.fieldName = fieldName;
  error.status = statusCode;
  return error;
}

export function isValidUuid(value) {
  return UUID_PATTERN.test(trimIdValue(value));
}

export function normalizePositiveBigIntString(value) {
  const normalized = trimIdValue(value);
  if (!normalized) return null;
  if (!POSITIVE_BIGINT_STRING_PATTERN.test(normalized)) return null;
  return normalized;
}

export function normalizeValidUuidOrBigInt(value) {
  const normalized = trimIdValue(value);
  if (!normalized) return null;

  if (POSITIVE_BIGINT_STRING_PATTERN.test(normalized)) {
    return normalized;
  }

  if (isValidUuid(normalized)) {
    return normalized;
  }

  return null;
}

export function normalizeSubscriptionRequestId(value) {
  return normalizeValidUuidOrBigInt(value);
}

export function optionalValidUuid(value, fieldName = "id") {
  const normalized = trimIdValue(value);
  if (!normalized) return null;
  return requireValidUuid(normalized, fieldName);
}

export function requireValidUuid(value, fieldName = "id") {
  const normalized = trimIdValue(value);

  if (!isValidUuid(normalized)) {
    throw buildInvalidIdError({
      fieldName,
      errorCode: "INVALID_UUID",
      message: `INVALID_${String(fieldName).toUpperCase()}`,
    });
  }

  return normalized;
}

export function requireValidPositiveBigIntString(value, fieldName = "id") {
  const normalized = normalizePositiveBigIntString(value);

  if (!normalized) {
    throw buildInvalidIdError({
      fieldName,
      errorCode: "INVALID_POSITIVE_BIGINT_ID",
      message: `معرف ${String(fieldName)} غير صالح`,
    });
  }

  return normalized;
}

export function requireValidUuidOrBigInt(value, fieldName = "id") {
  const normalized = normalizeValidUuidOrBigInt(value);

  if (!normalized) {
    throw buildInvalidIdError({
      fieldName,
      errorCode: "INVALID_UUID_OR_BIGINT_ID",
      message: `معرف ${String(fieldName)} غير صالح`,
    });
  }

  return normalized;
}

export function requireValidSubscriptionRequestId(value, fieldName = "requestId") {
  const normalized = normalizeSubscriptionRequestId(value);

  if (!normalized) {
    throw buildInvalidIdError({
      fieldName,
      errorCode: "INVALID_REQUEST_ID",
      message: `INVALID_${String(fieldName).toUpperCase()}`,
    });
  }

  return normalized;
}

export function filterValidUuids(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => trimIdValue(value))
    .filter(isValidUuid);
}

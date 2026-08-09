import crypto from "node:crypto";

/** Base62-ish alphabet — URL-safe, visually clean. */
export const SMART_LINK_SHORT_CODE_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const SMART_LINK_SHORT_CODE_LENGTH = 8;

/** ~47.6 bits entropy at length 8 (62^8 combinations). */
export function generateSmartLinkShortCode(length = SMART_LINK_SHORT_CODE_LENGTH) {
  const size = Math.max(6, Math.min(10, Number(length) || SMART_LINK_SHORT_CODE_LENGTH));
  const bytes = crypto.randomBytes(size + 4);
  let code = "";

  for (let i = 0; i < size; i += 1) {
    code += SMART_LINK_SHORT_CODE_ALPHABET[bytes[i] % SMART_LINK_SHORT_CODE_ALPHABET.length];
  }

  // Referral codes are uppercase-only; require lowercase so /r/<code> routing stays unambiguous.
  if (!/[a-z]/.test(code)) {
    const idx = bytes[size] % size;
    const lower = SMART_LINK_SHORT_CODE_ALPHABET[bytes[size + 1] % 26];
    code = `${code.slice(0, idx)}${lower}${code.slice(idx + 1)}`;
  }

  return code;
}

export function sanitizeSmartLinkShortCode(value) {
  const cleaned = String(value || "").trim();
  if (!/^[A-Za-z0-9]{6,10}$/.test(cleaned)) return null;
  return cleaned;
}

export function isSmartLinkShortCode(value) {
  const cleaned = sanitizeSmartLinkShortCode(value);
  if (!cleaned) return false;
  // Partner referral codes are uppercase-only; canonical smart-link codes include lowercase.
  return /[a-z]/.test(cleaned);
}

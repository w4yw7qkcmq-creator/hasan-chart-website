/**
 * Deterministic Unicode-safe helpers for public rendering boundaries.
 * Prevents lone UTF-16 surrogate code units from crashing encode/serialize paths.
 */

export function stripLoneSurrogates(value) {
  const text = String(value ?? "");
  if (!text) return "";

  let output = "";

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += text[index] + text[index + 1];
        index += 1;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    output += text[index];
  }

  return output;
}

export function truncateWithoutBreakingSurrogates(value, maxLength) {
  const text = String(value ?? "");
  const limit = Number(maxLength);

  if (!Number.isFinite(limit) || limit <= 0) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  let end = limit;
  const code = text.charCodeAt(end - 1);

  if (code >= 0xd800 && code <= 0xdbff) {
    end -= 1;
  }

  return text.slice(0, end);
}

export function safeEncodeURIComponent(value) {
  return encodeURIComponent(stripLoneSurrogates(value));
}

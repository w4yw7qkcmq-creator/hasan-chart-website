export function trimText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

export function nullIfEmptyText(value, maxLength = 2000) {
  if (!value) {
    return null;
  }

  return String(value).trim().slice(0, maxLength);
}

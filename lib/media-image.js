export function isExternalImageSrc(src = "") {
  const value = String(src || "").trim();
  return value.startsWith("http://") || value.startsWith("https://");
}

export function isOptimizableImageSrc(src = "") {
  const value = String(src || "").trim();

  if (!value || value.startsWith("/")) {
    return true;
  }

  if (!isExternalImageSrc(value)) {
    return false;
  }

  try {
    const { hostname } = new URL(value);

    return (
      hostname === "www.hasanchartworld.com" ||
      hostname === "hasanchartworld.com" ||
      hostname.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}

export function shouldUnoptimizeImageSrc(src = "") {
  return isExternalImageSrc(src) && !isOptimizableImageSrc(src);
}

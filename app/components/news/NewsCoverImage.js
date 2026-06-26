"use client";

import { useMemo, useState } from "react";

const BLOCKED_SRC_PATTERN =
  /source\.unsplash\.com|images\.unsplash\.com|unsplash\.com\/photo|coindesk\.com/i;

function getSafeImageSrc(src) {
  const value = String(src || "").trim();
  if (!value || BLOCKED_SRC_PATTERN.test(value)) return null;
  return value;
}

export function NewsCoverImage({
  src,
  alt,
  loading = "lazy",
  className = "news-card__image",
  fallbackClassName = "news-card__fallback",
  fallback,
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;

  return (
    <>
      <div className={`${fallbackClassName} ${showImage ? "news-card__fallback--hidden" : ""}`}>
        {fallback}
      </div>
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className={showImage ? className : "news-card__image news-card__image--hidden"}
        />
      ) : null}
    </>
  );
}

export function NewsArticleCoverImage({
  src,
  alt,
  className = "relative z-10 h-full w-full object-cover",
  fallbackClassName = "absolute inset-0 flex items-center justify-center fallback-article-image",
  fallback,
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;

  return (
    <>
      <div
        className={`${fallbackClassName} ${showImage ? "hidden" : "flex"}`}
        style={{ zIndex: 15 }}
      >
        {fallback}
      </div>
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={alt}
          onError={() => setFailed(true)}
          className={showImage ? className : "hidden"}
        />
      ) : null}
    </>
  );
}

"use client";

import { useState } from "react";

export function NewsCoverImage({
  src,
  alt,
  loading = "lazy",
  className = "relative z-10 h-full w-full object-cover transition duration-700 group-hover:scale-105",
  fallbackClassName = "absolute inset-0 flex items-center justify-center text-center fallback-news-image",
  fallback,
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <>
      <div className={`${fallbackClassName} ${showImage ? "hidden" : "flex"}`}>{fallback}</div>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
          className={showImage ? className : "hidden"}
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
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <>
      <div
        className={`${fallbackClassName} ${showImage ? "hidden" : "flex"}`}
        style={{ zIndex: 15 }}
      >
        {fallback}
      </div>
      {src ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className={showImage ? className : "hidden"}
        />
      ) : null}
    </>
  );
}

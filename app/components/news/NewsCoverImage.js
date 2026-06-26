"use client";

import { useMemo, useState } from "react";
import { getNewsImageSources } from "../../../lib/news-images";

const BLOCKED_SRC_PATTERN =
  /source\.unsplash\.com|images\.unsplash\.com|unsplash\.com\/photo|coindesk\.com/i;

const FALLBACK_IMAGE_SRC = "/favicon.png";

function getSafeImageSrc(src) {
  const value = String(src || "").trim();
  if (!value || BLOCKED_SRC_PATTERN.test(value)) return null;
  return value;
}

function NewsImageCore({
  src,
  webpSrc,
  alt,
  loading = "lazy",
  className,
  hiddenClassName,
  showImage,
  onError,
}) {
  if (!src) return null;

  if (webpSrc) {
    return (
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority="low"
          referrerPolicy="no-referrer"
          onError={onError}
          className={showImage ? className : hiddenClassName}
        />
      </picture>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority="low"
      referrerPolicy="no-referrer"
      onError={onError}
      className={showImage ? className : hiddenClassName}
    />
  );
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
  const imageSources = useMemo(() => getNewsImageSources(safeSrc), [safeSrc]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageSources.src) && !failed;

  return (
    <>
      <div className={`${fallbackClassName} ${showImage ? "news-card__fallback--hidden" : ""}`}>
        {fallback}
      </div>
      <NewsImageCore
        src={imageSources.src}
        webpSrc={imageSources.webpSrc}
        alt={alt}
        loading={loading}
        className={className}
        hiddenClassName={`${className} news-card__image--hidden`}
        showImage={showImage}
        onError={() => setFailed(true)}
      />
      {failed && safeSrc ? (
        <img
          src={FALLBACK_IMAGE_SRC}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={`${className} news-card__image--fallback`}
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
  const imageSources = useMemo(() => getNewsImageSources(safeSrc), [safeSrc]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageSources.src) && !failed;

  return (
    <>
      <div
        className={`${fallbackClassName} ${showImage ? "hidden" : "flex"}`}
        style={{ zIndex: 15 }}
      >
        {fallback}
      </div>
      <NewsImageCore
        src={imageSources.src}
        webpSrc={imageSources.webpSrc}
        alt={alt}
        loading="lazy"
        className={className}
        hiddenClassName="hidden"
        showImage={showImage}
        onError={() => setFailed(true)}
      />
      {failed && safeSrc ? (
        <img
          src={FALLBACK_IMAGE_SRC}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className={`${className} opacity-40`}
        />
      ) : null}
    </>
  );
}

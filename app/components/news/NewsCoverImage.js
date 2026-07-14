"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { normalizeNewsImageUrl } from "../../../lib/news-images";
import { shouldUnoptimizeImageSrc } from "../../../lib/media-image";

const BLOCKED_SRC_PATTERN =
  /source\.unsplash\.com|images\.unsplash\.com|unsplash\.com\/photo|coindesk\.com/i;

const FALLBACK_IMAGE_SRC = "/favicon.png";
const FALLBACK_ALT = "شعار HasaN CharT World";

function getSafeImageSrc(src) {
  const value = String(src || "").trim();
  if (!value || BLOCKED_SRC_PATTERN.test(value)) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  return normalizeNewsImageUrl(value);
}

function NewsImageCore({
  src,
  alt,
  priority = false,
  sizes,
  quality = 72,
  shellClassName = "news-media-image-shell",
  imageClassName,
  hidden = false,
  onError,
}) {
  if (!src || hidden) {
    return null;
  }

  return (
    <div className={shellClassName}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? undefined : "lazy"}
        decoding="async"
        unoptimized={shouldUnoptimizeImageSrc(src)}
        referrerPolicy="no-referrer"
        onError={onError}
        className={imageClassName}
      />
    </div>
  );
}

export function NewsCoverImage({
  src,
  alt,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px",
  className = "news-card__image",
  fallbackClassName = "news-card__fallback",
  fallback,
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;
  const resolvedAlt = alt || "صورة الخبر";

  return (
    <>
      <div className={`${fallbackClassName} ${showImage ? "news-card__fallback--hidden" : ""}`}>
        {fallback}
      </div>
      <NewsImageCore
        src={safeSrc}
        alt={resolvedAlt}
        priority={priority}
        sizes={sizes}
        quality={68}
        imageClassName={className}
        hidden={!showImage}
        onError={() => setFailed(true)}
      />
      {failed && safeSrc ? (
        <div className="news-media-image-shell">
          <Image
            src={FALLBACK_IMAGE_SRC}
            alt={FALLBACK_ALT}
            fill
            sizes={sizes}
            quality={60}
            loading="lazy"
            decoding="async"
            className={`${className} news-card__image--fallback`}
          />
        </div>
      ) : null}
    </>
  );
}

export function NewsArticleCoverImage({
  src,
  alt,
  priority = true,
  sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 896px, 896px",
  className = "news-article-cover-image",
  fallbackClassName = "absolute inset-0 flex items-center justify-center fallback-article-image",
  fallback,
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;
  const resolvedAlt = alt || "صورة الخبر";

  return (
    <>
      <div
        className={`${fallbackClassName} ${showImage ? "hidden" : "flex"}`}
        style={{ zIndex: 15 }}
      >
        {fallback}
      </div>
      <NewsImageCore
        src={safeSrc}
        alt={resolvedAlt}
        priority={priority}
        sizes={sizes}
        quality={82}
        shellClassName="news-media-image-shell news-media-image-shell--article"
        imageClassName={className}
        hidden={!showImage}
        onError={() => setFailed(true)}
      />
      {failed && safeSrc ? (
        <div className="news-media-image-shell news-media-image-shell--article">
          <Image
            src={FALLBACK_IMAGE_SRC}
            alt={FALLBACK_ALT}
            fill
            sizes={sizes}
            quality={60}
            loading="lazy"
            decoding="async"
            className={`${className} opacity-40`}
          />
        </div>
      ) : null}
    </>
  );
}

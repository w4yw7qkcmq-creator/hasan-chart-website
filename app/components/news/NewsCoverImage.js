"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  isBlockedNewsImageUrl,
  isSiteBrandingNewsImageUrl,
  normalizeNewsImageUrl,
} from "../../../lib/news-images";
import { shouldUnoptimizeImageSrc } from "../../../lib/media-image";
import { NewsCategoryFallbackCover } from "./NewsCategoryFallbackCover";
function getSafeImageSrc(src) {
  const value = String(src || "").trim();
  if (
    !value ||
    isBlockedNewsImageUrl(value) ||
    isSiteBrandingNewsImageUrl(value)
  ) {
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
      {" "}
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
      />{" "}
    </div>
  );
}
export function NewsCoverImage({
  src,
  alt,
  title = "",
  category = null,
  item = null,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px",
  className = "news-card__image",
  fallbackClassName = "news-card__fallback",
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;
  const resolvedAlt = alt || title || "صورة الخبر";
  const fallbackTitle = title || alt || "";
  return (
    <>
      {" "}
      {!showImage ? (
        <div className={fallbackClassName}>
          {" "}
          <NewsCategoryFallbackCover
            item={item}
            category={category}
            variant="card"
          />{" "}
        </div>
      ) : null}{" "}
      <NewsImageCore
        src={safeSrc}
        alt={resolvedAlt}
        priority={priority}
        sizes={sizes}
        quality={68}
        imageClassName={className}
        hidden={!showImage}
        onError={() => setFailed(true)}
      />{" "}
    </>
  );
}
export function NewsArticleCoverImage({
  src,
  alt,
  title = "",
  category = null,
  item = null,
  priority = true,
  sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 896px, 896px",
  className = "news-article-cover-image",
  fallbackClassName = "absolute inset-0 z-[15]",
}) {
  const safeSrc = useMemo(() => getSafeImageSrc(src), [src]);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(safeSrc) && !failed;
  const resolvedAlt = alt || title || "صورة الخبر";
  const fallbackTitle = title || alt || "";
  return (
    <>
      {" "}
      {!showImage ? (
        <div className={fallbackClassName}>
          {" "}
          <NewsCategoryFallbackCover
            item={item}
            category={category}
            variant="article"
          />{" "}
        </div>
      ) : null}{" "}
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
      />{" "}
    </>
  );
}

"use client";

export default function TelegramImageGallery({ images = [], alt = "" }) {
  const list = Array.isArray(images) ? images.filter((img) => img?.url) : [];
  if (list.length === 0) return null;

  if (list.length === 1) {
    const img = list[0];
    return (
      <figure className="telegram-image-gallery telegram-image-gallery--single">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={alt || "صورة Telegram"}
          className="telegram-image-gallery__image"
          loading="lazy"
          decoding="async"
          width={img.width || undefined}
          height={img.height || undefined}
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      </figure>
    );
  }

  return (
    <div className="telegram-image-gallery telegram-image-gallery--multi" role="group" aria-label="معرض صور">
      {list.map((img, index) => (
        <figure key={`${img.url}-${index}`} className="telegram-image-gallery__item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.url}
            alt={alt ? `${alt} — ${index + 1}` : `صورة ${index + 1}`}
            className="telegram-image-gallery__image"
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            width={img.width || undefined}
            height={img.height || undefined}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        </figure>
      ))}
    </div>
  );
}

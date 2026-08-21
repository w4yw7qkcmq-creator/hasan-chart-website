"use client";

import TelegramImageGallery from "./TelegramImageGallery";
import TelegramSafeBody from "./TelegramSafeBody";
import "./telegram-content.css";

function formatTelegramDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}

export default function TelegramFeedCard({ item }) {
  if (!item?.id) return null;

  const anchorId = `telegram-feed-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <article id={anchorId} className="daily-analysis-card daily-analysis-card--telegram">
      <div className="daily-analysis-card__head">
        <div className="daily-analysis-card__tags">
          <span className="daily-analysis-card__telegram-badge">Telegram</span>
        </div>
        <time className="daily-analysis-card__date" dateTime={item.createdAt || undefined}>
          {formatTelegramDate(item.createdAt)}
        </time>
      </div>

      {item.title ? <h2 className="daily-analysis-card__title">{item.title}</h2> : null}

      {item.images?.length ? (
        <TelegramImageGallery images={item.images} alt={item.title || "منشور Telegram"} />
      ) : null}

      {item.content ? (
        <div className="daily-analysis-card__content">
          <TelegramSafeBody text={item.content} />
        </div>
      ) : null}

      <p className="daily-analysis-card__source">HasaN CharT ™ — Telegram</p>
    </article>
  );
}

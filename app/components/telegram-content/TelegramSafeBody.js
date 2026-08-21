"use client";

export default function TelegramSafeBody({ text, className = "" }) {
  const body = String(text ?? "");
  if (!body) return null;

  return (
    <div className={`telegram-safe-body ${className}`.trim()} dir="auto">
      {body}
    </div>
  );
}

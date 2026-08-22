"use client";

import { useCallback, useEffect, useState } from "react";

function formatUuidDisplay(value) {
  const id = String(value || "").trim();
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function UserAccountUuidRow({ userId }) {
  const id = String(userId || "").trim();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timerId = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timerId);
  }, [copied]);

  const copyUuid = useCallback(async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      window.prompt("انسخ معرّف الحساب:", id);
    }
  }, [id]);

  if (!id) {
    return (
      <div className="user-dashboard-info-row">
        <span>معرّف الحساب</span>
        <strong>—</strong>
      </div>
    );
  }

  return (
    <div className="user-dashboard-info-row user-dashboard-info-row--uuid">
      <span>معرّف الحساب</span>
      <div className="user-dashboard-uuid">
        <code className="user-dashboard-uuid__value" title={id}>
          {formatUuidDisplay(id)}
        </code>
        <button
          type="button"
          className="user-dashboard-uuid__copy"
          onClick={() => void copyUuid()}
          aria-label="نسخ معرّف الحساب"
        >
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>
    </div>
  );
}

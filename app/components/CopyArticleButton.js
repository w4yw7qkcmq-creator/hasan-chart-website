"use client";
import { useState } from "react";
import { useAppModal } from "./AppModalProvider";
export default function CopyArticleButton({ url }) {
  const [copied, setCopied] = useState(false);
  const { showAppModal } = useAppModal();
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      showAppModal({ type: "info", title: "انسخ رابط الخبر", message: url });
    }
  }
  return (
    <button type="button" onClick={handleCopy} className="ui-copy-article-btn">
      {" "}
      {copied ? "تم نسخ الرابط ✅" : "نسخ الرابط"}{" "}
    </button>
  );
}

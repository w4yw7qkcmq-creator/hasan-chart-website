

"use client";

import { useState } from "react";

export default function CopyArticleButton({ url }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      window.prompt("انسخ رابط الخبر:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex appearance-none items-center rounded-2xl border border-sky-500/40 bg-sky-600 px-4 py-3 text-sm font-black !text-white shadow-xl shadow-sky-600/20 transition hover:scale-105 hover:bg-sky-700 dark:border-sky-300/40 dark:bg-sky-400"
    >
      {copied ? "تم نسخ الرابط ✅" : "نسخ الرابط"}
    </button>
  );
}
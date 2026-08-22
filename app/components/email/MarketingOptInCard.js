"use client";

import { useEffect, useState } from "react";
import EmailPreferencesPanel from "./EmailPreferencesPanel";

const DISMISS_KEY = "hc_marketing_optin_card_dismissed";

export default function MarketingOptInCard() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    void fetch("/api/user/email-preferences", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const optedIn = data?.preferences?.marketingOptIn === true;
        const unsubscribed = Boolean(data?.preferences?.globalUnsubscribedAt);
        setVisible(!optedIn && !unsubscribed);
      })
      .catch(() => setVisible(false));
  }, []);

  if (dismissed || !visible) return null;

  return (
    <aside className="mb-6 rounded-[28px] border border-cyan-300/20 bg-gradient-to-l from-cyan-500/10 via-blue-500/5 to-transparent p-5 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-cyan-200">هل ترغب في تلقي الأخبار والتحديثات والعروض عبر البريد؟</p>
          <p className="mt-1 text-sm text-slate-400">
            اختياري — لن نرسل رسائل تسويقية إلا بعد موافقتك الصريحة.
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-bold text-slate-400 hover:text-white"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          إخفاء
        </button>
      </div>
      <EmailPreferencesPanel compact />
    </aside>
  );
}

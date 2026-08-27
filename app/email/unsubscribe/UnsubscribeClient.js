"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function UnsubscribeClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const unsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setStatus("done");
      setMessage("تم إلغاء الاشتراك في رسائل HasaN CharT World التسويقية.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "تعذر إكمال الطلب");
    }
  };

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center p-6 text-center">
      <h1 className="text-2xl font-black">إلغاء الاشتراك</h1>
      <p className="mt-3 text-slate-600">لن تصلك رسائل تسويقية مستقبلية من HasaN CharT World.</p>
      {status === "idle" ? (
        <button type="button" className="mt-6 rounded-2xl bg-slate-900 px-6 py-3 font-black text-white" onClick={unsubscribe}>
          تأكيد إلغاء الاشتراك
        </button>
      ) : null}
      {message ? <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm">{message}</p> : null}
    </main>
  );
}

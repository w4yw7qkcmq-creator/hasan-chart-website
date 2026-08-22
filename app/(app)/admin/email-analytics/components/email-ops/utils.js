export function maskEmail(email) {
  const raw = String(email || "").trim();
  if (!raw.includes("@")) return "—";
  const [local, domain] = raw.split("@");
  if (!local || !domain) return "—";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function formatRelativeTimeAr(iso) {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "منذ لحظات";
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
  if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
  return `منذ ${Math.floor(diffSec / 86400)} يوم`;
}

export function formatDurationMs(ms) {
  if (ms == null || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} ثانية`;
  if (sec < 3600) return `${Math.floor(sec / 60)} دقيقة`;
  return `${Math.floor(sec / 3600)} ساعة`;
}

export function parseErrorForDisplay(errorText) {
  const raw = String(errorText || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return {
      title: "خطأ غير معروف",
      summary: "حدث خطأ أثناء معالجة الرسالة.",
      severity: "medium",
    };
  }

  if (lower.includes("invalid") && (lower.includes("to") || lower.includes("recipient") || lower.includes("email"))) {
    return {
      title: "عنوان بريد غير صالح",
      summary: "تم رفض الرسالة لأن عنوان المستلم غير صالح.",
      severity: "high",
    };
  }

  if (lower.includes("bounce") || lower.includes("bounced")) {
    return {
      title: "ارتداد البريد",
      summary: "تعذر تسليم الرسالة إلى عنوان المستلم.",
      severity: "high",
    };
  }

  if (lower.includes("rate limit") || lower.includes("too many")) {
    return {
      title: "تجاوز حد الإرسال",
      summary: "تم تأجيل الإرسال مؤقتًا بسبب ضغط على الطابور.",
      severity: "medium",
    };
  }

  if (lower.includes("suppressed") || lower.includes("unsubscribed")) {
    return {
      title: "مستلم مُستبعد",
      summary: "المستلم مُستبعد وفق سياسة الإرسال أو الموافقة.",
      severity: "low",
    };
  }

  return {
    title: "فشل الإرسال",
    summary: "تعذر إكمال إرسال الرسالة. راجع التفاصيل التقنية.",
    severity: "medium",
  };
}

export function computeCampaignProgress(campaign) {
  const eligible = Number(campaign?.eligible_count) || 0;
  const delivered = Number(campaign?.delivered_count) || 0;
  const queued = Number(campaign?.queued_count) || 0;
  const total = eligible || queued + delivered;
  if (!total) return { percent: 0, label: "0%" };
  const done = delivered + (campaign?.status === "completed" ? 0 : 0);
  const percent = Math.min(100, Math.round((delivered / total) * 100));
  return {
    percent,
    label: `${percent}%`,
    detail: `${delivered.toLocaleString("ar")} من ${total.toLocaleString("ar")}`,
  };
}

export function deriveQueueHealth(metrics) {
  if (!metrics?.counts) return { level: "unknown", label: "غير متاح", description: "بانتظار البيانات" };
  const { pending = 0, failed = 0, staleProcessing = 0, uncertain = 0 } = metrics.counts;
  if (staleProcessing > 0 || uncertain > 5 || (failed > 10 && pending > 50)) {
    return {
      level: "warning",
      label: "يحتاج انتباه",
      description: "هناك عناصر متأخرة أو أخطاء تحتاج مراجعة.",
    };
  }
  return {
    level: "healthy",
    label: "سليم",
    description: "الطابور يعمل ضمن المؤشرات الطبيعية.",
  };
}

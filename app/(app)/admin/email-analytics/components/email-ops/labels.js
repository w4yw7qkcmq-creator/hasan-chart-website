/** Central Arabic labels for Email Operations Center UI */

export const QUEUE_STATUS_LABELS = Object.freeze({
  pending: "بانتظار الإرسال",
  processing: "قيد المعالجة",
  accepted: "قبله مزود البريد",
  sent: "تم الإرسال",
  failed: "فشل",
  skipped: "تم التجاوز",
  uncertain: "غير مؤكد",
  retryPending: "إعادة محاولة",
  staleProcessing: "معالجة متأخرة",
});

export const CAMPAIGN_STATUS_LABELS = Object.freeze({
  draft: "مسودة",
  preparing: "تجهيز الجمهور",
  ready: "جاهزة",
  sending: "قيد الإرسال",
  paused: "متوقفة مؤقتًا",
  completed: "مكتملة",
  cancelled: "ملغاة",
  failed: "فشلت",
});

export const DELIVERY_STATUS_LABELS = Object.freeze({
  pending: "بانتظار",
  queued: "في الطابور",
  sent: "تم الإرسال",
  delivered: "تم التسليم",
  failed: "فشل",
  bounced: "ارتداد",
  complained: "شكوى",
  suppressed: "مُستبعد",
  excluded: "مستبعد",
  delayed: "متأخر",
});

export const CAMPAIGN_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: CAMPAIGN_STATUS_LABELS.draft },
  { value: "preparing", label: CAMPAIGN_STATUS_LABELS.preparing },
  { value: "ready", label: CAMPAIGN_STATUS_LABELS.ready },
  { value: "sending", label: CAMPAIGN_STATUS_LABELS.sending },
  { value: "paused", label: CAMPAIGN_STATUS_LABELS.paused },
  { value: "completed", label: CAMPAIGN_STATUS_LABELS.completed },
  { value: "cancelled", label: CAMPAIGN_STATUS_LABELS.cancelled },
  { value: "failed", label: CAMPAIGN_STATUS_LABELS.failed },
];

export const AUDIENCE_OPTIONS = [
  {
    value: "all_eligible",
    title: "جميع المستخدمين المؤهلين",
    description: "يرسل فقط لمن وافق صراحة على الرسائل التسويقية.",
    iconKey: "users",
  },
  {
    value: "active_subscribers",
    title: "المشتركون النشطون",
    description: "ضمن المؤهلين للتسويق فقط.",
    iconKey: "star",
  },
  {
    value: "non_subscribers",
    title: "غير المشتركين",
    description: "ضمن المؤهلين للتسويق فقط.",
    iconKey: "user",
  },
  {
    value: "selected_users",
    title: "مستخدمون محددون",
    description: "بحث واختيار يدوي للمستلمين.",
    iconKey: "search",
  },
];

export const WIZARD_STEPS = [
  { title: "الجمهور", description: "حدد من سيستلم الرسالة." },
  { title: "الرسالة", description: "اكتب محتوى الحملة." },
  { title: "المعاينة", description: "راجع الرسالة وأرسل نسخة اختبارية." },
  { title: "التأكيد", description: "راجع الجمهور وابدأ الحملة." },
];

export function getQueueStatusLabel(status) {
  return QUEUE_STATUS_LABELS[status] || status || "—";
}

export function getCampaignStatusLabel(status) {
  return CAMPAIGN_STATUS_LABELS[status] || status || "—";
}

export function getDeliveryStatusLabel(status) {
  return DELIVERY_STATUS_LABELS[status] || status || "—";
}

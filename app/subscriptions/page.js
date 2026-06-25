"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppModal from "../components/AppModal";

const plans = [
  {
    category: "باقات السبوت",
    name: "سبوت - شهر",
    price: "$50",
    period: "/شهر",
    icon: "⚡",
    glow: "from-cyan-400/20 to-blue-500/10",
    badge: "Spot",
    features: [
      "توصيات سبوت لمدة شهر",
      "متابعة العملات الرئيسية",
      "نقاط دخول وخروج واضحة",
      "دعم عبر التليجرام",
    ],
  },
  {
    category: "باقات السبوت",
    name: "سبوت - 3 أشهر",
    price: "$125",
    period: "/ثلاثة أشهر",
    icon: "📈",
    glow: "from-blue-500/25 to-cyan-400/10",
    badge: "Spot Plus",
    featured: true,
    features: [
      "توصيات سبوت لمدة 3 أشهر",
      "متابعة مستمرة للصفقات",
      "تحديثات سوق يومية",
      "دعم مباشر مع الفريق",
    ],
  },
  {
    category: "باقات السبوت",
    name: "سبوت - سنة",
    price: "$500",
    period: "/سنة",
    icon: "💎",
    glow: "from-indigo-500/25 to-cyan-400/10",
    badge: "Spot VIP",
    features: [
      "توصيات سبوت لمدة سنة كاملة",
      "متابعة طويلة المدى",
      "تحديثات وتحليلات دورية",
      "أولوية في الدعم الفني",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - شهر",
    price: "$99",
    period: "/شهر",
    icon: "🚀",
    glow: "from-cyan-400/20 to-blue-500/10",
    badge: "Futures",
    features: [
      "توصيات فيوتشر لمدة شهر",
      "متابعة فرص قصيرة المدى",
      "إدارة مخاطر أساسية",
      "تنبيهات دخول وخروج",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - 3 أشهر",
    price: "$250",
    period: "/ثلاثة أشهر",
    icon: "🔥",
    glow: "from-blue-500/30 to-cyan-400/10",
    badge: "Futures Plus",
    featured: true,
    features: [
      "توصيات فيوتشر لمدة 3 أشهر",
      "متابعة مستمرة للصفقات",
      "إدارة مخاطر احترافية",
      "دعم مباشر مع الفريق",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - سنة",
    price: "$800",
    period: "/سنة",
    icon: "👑",
    glow: "from-indigo-500/30 to-cyan-400/10",
    badge: "Futures VIP",
    features: [
      "توصيات فيوتشر لمدة سنة كاملة",
      "متابعة احترافية للصفقات",
      "خطة إدارة مخاطر متقدمة",
      "أولوية كاملة بالدعم الفني",
    ],
  },
];

function Feature({ text }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
        ✓
      </div>
      <span>{text}</span>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "غير محدد";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "غير محدد";

  return date.toLocaleDateString("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getRemainingDays(expiresAt) {
  if (!expiresAt) return null;

  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) return null;

  const diff = expiresTime - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function SubscriptionsPage() {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [paymentProof, setPaymentProof] = useState("");
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      setNotification(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    const loadCurrentSubscription = async () => {
      try {
        const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

        if (!currentUser?.email) {
          setCurrentSubscription(null);
          return;
        }

        const response = await fetch(
          `/api/my-subscription-status?email=${encodeURIComponent(currentUser.email)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success || !result?.active) {
          setCurrentSubscription(null);
          return;
        }

        setCurrentSubscription(result.current_subscription || result.plans?.[0] || null);
      } catch {
        setCurrentSubscription(null);
      } finally {
        setSubscriptionLoading(false);
      }
    };

    loadCurrentSubscription();
  }, []);

  const handlePaymentProof = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNotification({
        type: "error",
        title: "ملف غير مدعوم",
        message: "يرجى رفع صورة إشعار الدفع فقط.",
      });
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setPaymentProof(reader.result || "");
    };

    reader.onerror = () => {
      setNotification({
        type: "error",
        title: "تعذر رفع الصورة",
        message: "حاول رفع صورة أوضح لإشعار الدفع.",
      });
    };

    reader.readAsDataURL(file);
  };

  const requestSubscription = async (plan) => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!currentUser?.email) {
      setNotification({
        type: "error",
        title: "يجب تسجيل الدخول أولاً",
        message: "سجّل دخولك حتى تتمكن من إرسال طلب الاشتراك.",
      });

      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    setSelectedPlan(plan);
    setTelegramUsername("");
    setPaymentProof("");
  };

  const submitSubscriptionRequest = async () => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!selectedPlan || !currentUser?.email) return;

    const cleanTelegramUsername = telegramUsername.trim();

    if (!cleanTelegramUsername) {
      setNotification({
        type: "error",
        title: "أدخل يوزر التليجرام",
        message: "يرجى كتابة يوزر التليجرام حتى يستطيع الدعم التواصل معك.",
      });
      return;
    }

    if (!paymentProof) {
      setNotification({
        type: "error",
        title: "أرفق إشعار الدفع",
        message: "يرجى رفع صورة إثبات الدفع قبل إرسال الطلب.",
      });
      return;
    }

    setLoadingPlan(selectedPlan.name);

    try {
      const response = await fetch("/api/subscription-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_email: currentUser.email,
          username: currentUser.username || currentUser.email,
          plan_name: selectedPlan.name,
          category: selectedPlan.category,
          price: selectedPlan.price,
          telegram_username: cleanTelegramUsername,
          payment_proof: paymentProof,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setNotification({
          type: "error",
          title: "فشل إرسال الطلب",
          message: result?.error || "حدث خطأ غير معروف",
        });
        return;
      }

      setSelectedPlan(null);
      setTelegramUsername("");
      setPaymentProof("");

      setNotification({
        type: "success",
        title: "طلبك قيد المعالجة ✅",
        message: "تم استلام طلب الاشتراك وإثبات الدفع، وسيقوم الدعم بمراجعته وتفعيل الباقة.",
      });
    } catch (err) {
      setNotification({
        type: "error",
        title: "حدث خطأ أثناء إرسال الطلب",
        message: "حاول مرة ثانية بعد قليل.",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <main className="relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      {notification && (
        <AppModal
          open={Boolean(notification)}
          type={notification.type === "success" ? "success" : notification.type === "warning" ? "warning" : "error"}
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      {selectedPlan && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 px-5 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-[34px] border border-white/70 bg-white p-7 text-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-cyan-600">طلب اشتراك جديد</p>
                <h3 className="mt-2 text-3xl font-black">إتمام طلب الاشتراك</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
                  أرسل بيانات الدفع ليتمكن الدعم من مراجعة الطلب وتفعيل الباقة.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setTelegramUsername("");
                  setPaymentProof("");
                }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xl font-black text-slate-600 transition hover:bg-slate-200"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-cyan-100 bg-cyan-50/80 p-4">
                <p className="text-xs font-black text-cyan-700">الباقة المختارة</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xl font-black text-slate-950">{selectedPlan.name}</span>
                  <span className="rounded-2xl bg-white px-4 py-2 text-lg font-black text-blue-700 shadow-sm">
                    {selectedPlan.price}
                  </span>
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">يوزر التليجرام</span>
                <input
                  value={telegramUsername}
                  onChange={(event) => setTelegramUsername(event.target.value)}
                  placeholder="مثال: @username"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-right font-bold text-slate-950 outline-none transition focus:border-cyan-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">صورة إشعار الدفع</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePaymentProof}
                  className="w-full rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/70 px-4 py-4 text-sm font-bold text-slate-700 file:ml-4 file:rounded-xl file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:font-black file:text-white"
                />
                {paymentProof && (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                    تم إرفاق صورة إثبات الدفع ✅
                  </div>
                )}
              </label>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={submitSubscriptionRequest}
                disabled={loadingPlan === selectedPlan.name}
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.28)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingPlan === selectedPlan.name ? "جاري إرسال الطلب..." : "إرسال الطلب للمراجعة"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setTelegramUsername("");
                  setPaymentProof("");
                }}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 font-black text-slate-700 transition hover:bg-slate-100"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 space-y-8 p-4 md:p-6">
        <section className="relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 md:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 text-center">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              PREMIUM MEMBERSHIPS
            </span>

            <h1 className="mt-6 text-5xl font-black leading-tight md:text-6xl">
              اشتراكات التوصيات Spot & Futures
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 text-slate-300">
              اختر من باقات السبوت أو الفيوتشر حسب أسلوب تداولك، مع توصيات واضحة ومتابعة احترافية من فريق HasaN CharT.
            </p>
          </div>
        </section>

        <section className="rounded-[34px] border border-cyan-200 bg-white/95 p-6 text-slate-950 shadow-[0_24px_90px_rgba(14,165,233,0.18)] backdrop-blur-2xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-700">
                CURRENT MEMBERSHIP
              </span>
              <h2 className="mt-4 text-3xl font-black text-slate-950">اشتراكك الحالي</h2>
              <p className="mt-3 max-w-2xl font-bold leading-8 text-slate-600">
                تابع حالة باقتك الحالية وتاريخ البداية والانتهاء وعدد الأيام المتبقية قبل التجديد.
              </p>
            </div>

            {currentSubscription && (
              <Link
                href="#plans"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 text-center font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.28)] transition hover:scale-[1.02]"
              >
                تجديد الاشتراك
              </Link>
            )}
          </div>

          {subscriptionLoading ? (
            <div className="mt-6 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-center font-black text-cyan-700">
              جاري تحميل بيانات الاشتراك...
            </div>
          ) : currentSubscription ? (
            <div className="mt-7 grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
                <p className="text-xs font-black text-cyan-700">اسم الباقة</p>
                <p className="mt-3 text-xl font-black text-slate-950">
                  {currentSubscription.plan_name || currentSubscription.category || "اشتراك VIP"}
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <p className="text-xs font-black text-emerald-700">تاريخ البداية</p>
                <p className="mt-3 text-xl font-black text-slate-950">
                  {formatDate(currentSubscription.started_at || currentSubscription.created_at)}
                </p>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-xs font-black text-amber-700">تاريخ الانتهاء</p>
                <p className="mt-3 text-xl font-black text-slate-950">
                  {formatDate(currentSubscription.expires_at)}
                </p>
              </div>

              <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-600 to-cyan-400 p-5 text-white shadow-[0_18px_50px_rgba(37,99,235,0.25)]">
                <p className="text-xs font-black text-blue-50">الأيام المتبقية</p>
                <p className="mt-3 text-4xl font-black text-white">
                  {getRemainingDays(currentSubscription.expires_at) ?? "--"}
                </p>
                <p className="mt-1 text-sm font-black text-blue-50">يوم</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-cyan-300 bg-cyan-50 p-6 text-center">
              <p className="text-xl font-black text-slate-950">لا يوجد اشتراك مفعل حالياً</p>
              <p className="mt-2 font-bold text-slate-600">اختر إحدى الباقات بالأسفل وأرسل طلب الاشتراك للمراجعة.</p>
            </div>
          )}
        </section>

        <section id="plans" className="space-y-8">
          {["باقات السبوت", "باقات الفيوتشر"].map((category) => (
            <div key={category} className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black text-white">{category}</h2>
                  <p className="mt-2 text-slate-400">
                    {category === "باقات السبوت"
                      ? "اشتراكات توصيات السبوت للفترات الشهرية والربع سنوية والسنوية."
                      : "اشتراكات توصيات الفيوتشر مع متابعة وإدارة مخاطر حسب مدة الباقة."}
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200">
                  {category === "باقات السبوت" ? "SPOT" : "FUTURES"}
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                {plans
                  .filter((plan) => plan.category === category)
                  .map((plan) => (
                    <article
                      key={plan.name}
                      className={`group relative overflow-hidden rounded-[34px] border p-7 shadow-2xl backdrop-blur-2xl transition hover:-translate-y-2 hover:shadow-[0_25px_80px_rgba(0,102,255,0.22)] ${
                        plan.featured
                          ? "border-cyan-300/40 bg-cyan-400/[0.08]"
                          : "border-cyan-300/15 bg-white/[0.045]"
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${plan.glow}`} />
                      <div className="absolute -top-16 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl transition group-hover:bg-cyan-400/20" />

                      <div className="relative z-10">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                              {plan.badge}
                            </span>

                            <h2 className="mt-5 text-3xl font-black text-white">
                              {plan.name}
                            </h2>
                          </div>

                          <div className="grid h-16 w-16 place-items-center rounded-3xl border border-cyan-300/20 bg-black/25 text-3xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
                            {plan.icon}
                          </div>
                        </div>

                        <div className="mt-8 flex items-end gap-2">
                          <span className="text-6xl font-black text-white">
                            {plan.price}
                          </span>
                          <span className="pb-2 text-slate-400">{plan.period}</span>
                        </div>

                        <div className="mt-8 space-y-3">
                          {plan.features.map((feature) => (
                            <Feature key={feature} text={feature} />
                          ))}
                        </div>

                        <div className="mt-8 space-y-3">
                          <button
                            onClick={() => requestSubscription(plan)}
                            disabled={loadingPlan === plan.name}
                            className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 text-center font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {loadingPlan === plan.name ? "جاري إرسال الطلب..." : "اشترك الآن"}
                          </button>

                          <Link
                            href="https://t.me/HasaNCharTSupport"
                            className="block w-full rounded-2xl border border-cyan-300/15 bg-black/20 px-6 py-4 text-center font-black text-cyan-100 transition hover:bg-cyan-400/10"
                          >
                            التواصل مع الدعم
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                SUPPORT & CONSULTING
              </span>

              <h2 className="mt-5 text-4xl font-black text-white">
                تحتاج خطة خاصة أو استشارة؟
              </h2>

              <p className="mt-4 max-w-3xl leading-8 text-slate-300">
                يمكنك التواصل مباشرة مع فريق HasaN CharT للحصول على اشتراك مخصص، إدارة حسابات، أو خدمات تداول خاصة.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="https://t.me/HasaNCharTSupport"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 text-center font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                الدعم الفني
              </Link>

              <Link
                href="https://t.me/CEOHasaNCharT"
                className="rounded-2xl border border-cyan-300/15 bg-black/20 px-6 py-4 text-center font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                التواصل مع دكتور حسن
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
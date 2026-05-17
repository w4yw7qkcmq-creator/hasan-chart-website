"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

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

export default function SubscriptionsPage() {
  const [loadingPlan, setLoadingPlan] = useState(null);

  const requestSubscription = async (plan) => {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!currentUser?.email) {
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = "/login";
      return;
    }

    setLoadingPlan(plan.name);

    try {
      const { error } = await supabase.from("subscription_requests").insert({
        user_email: currentUser.email,
        username: currentUser.username || currentUser.email,
        plan_name: plan.name,
        category: plan.category,
        price: plan.price,
        status: "بانتظار الدفع",
      });

      if (error) {
        alert("فشل إرسال طلب الاشتراك: " + error.message);
        return;
      }

      alert("تم إرسال طلب الاشتراك بنجاح ✅ سيتم التواصل معك لإتمام الدفع وتفعيل الباقة.");
    } catch (err) {
      alert("حدث خطأ أثناء إرسال طلب الاشتراك");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <main className="relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
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

        <section className="space-y-8">
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
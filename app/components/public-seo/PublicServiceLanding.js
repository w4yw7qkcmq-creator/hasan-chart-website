"use client";

import Link from "next/link";
import { getPublicSeoPage } from "../../../lib/public-seo-content";

function FeatureCard({ icon, title, text }) {
  return (
    <article className="public-seo-card rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-xl backdrop-blur-2xl">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-black text-white">{title}</h3>
      <p className="mt-3 leading-8 text-slate-300">{text}</p>
    </article>
  );
}

function FaqItem({ question, answer }) {
  return (
    <details className="public-seo-card group rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-5 backdrop-blur-xl">
      <summary className="cursor-pointer list-none text-lg font-black text-white marker:content-none">
        <span className="flex items-center justify-between gap-4">
          {question}
          <span className="text-cyan-300 transition group-open:rotate-45">+</span>
        </span>
      </summary>
      <p className="mt-4 leading-8 text-slate-300">{answer}</p>
    </details>
  );
}

export default function PublicServiceLanding({ pageKey }) {
  const page = getPublicSeoPage(pageKey);

  if (!page) {
    return null;
  }

  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              {page.eyebrow}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">{page.heroTitle}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 text-slate-300">{page.heroSubtitle}</p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
              >
                تسجيل الدخول
              </Link>
              <Link
                href="/register"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                إنشاء حساب
              </Link>
              <Link
                href={page.startHref}
                className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 font-black text-white transition hover:bg-white/10"
              >
                ابدأ الآن
              </Link>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">المميزات</h2>
            <p className="mt-3 text-slate-400">ما الذي تحصل عليه من هذه الخدمة؟</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {page.features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">كيف تستفيد؟</h2>
          <ul className="mt-6 space-y-4">
            {page.benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-slate-200"
              >
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
                  ✓
                </span>
                <span className="leading-8">{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">أسئلة شائعة</h2>
          </div>
          <div className="space-y-3">
            {page.faq.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/30 via-blue-600/20 to-cyan-400/10 p-8 text-center shadow-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">جاهز للبدء؟</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-8 text-slate-200">
            أنشئ حسابك أو سجّل الدخول للوصول الكامل إلى الخدمة داخل HasaN CharT World.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
            >
              إنشاء حساب مجاني
            </Link>
            <Link
              href="/login"
              className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100"
            >
              لدي حساب بالفعل
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

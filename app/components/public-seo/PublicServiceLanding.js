"use client";

import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
import LinkifiedText from "../seo/LinkifiedText";
import { getPublicSeoPage } from "../../../lib/public-seo-content";
import { getServiceBreadcrumbs } from "../../../lib/internal-links";
import PopularServices from "./PopularServices";
import RelatedServices from "./RelatedServices";

function FeatureCard({ icon, title, text }) {
  return (
    <article className="public-seo-card rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-xl backdrop-blur-2xl">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-black text-white">
        <LinkifiedText text={title} maxLinks={1} />
      </h3>
      <p className="mt-3 leading-8 text-slate-300">
        <LinkifiedText text={text} maxLinks={2} />
      </p>
    </article>
  );
}

function FaqItem({ question, answer }) {
  return (
    <details className="public-seo-card group rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-5 backdrop-blur-xl">
      <summary className="cursor-pointer list-none text-lg font-black text-white marker:content-none">
        <span className="flex items-center justify-between gap-4">
          <LinkifiedText text={question} maxLinks={1} />
          <span className="text-cyan-300 transition group-open:rotate-45">+</span>
        </span>
      </summary>
      <p className="mt-4 leading-8 text-slate-300">
        <LinkifiedText text={answer} maxLinks={2} />
      </p>
    </details>
  );
}

function SectionBlock({ title, subtitle, children }) {
  return (
    <section className="space-y-5">
      <div className="text-center">
        <h2 className="text-3xl font-black text-white md:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-3 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ProseSection({ title, paragraphs }) {
  if (!paragraphs?.length) return null;

  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <h2 className="text-3xl font-black text-white">{title}</h2>
      <div className="mt-6 space-y-5">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 48)} className="text-lg leading-9 text-slate-300">
            <LinkifiedText text={paragraph} maxLinks={2} />
          </p>
        ))}
      </div>
    </section>
  );
}

export default function PublicServiceLanding({ pageKey }) {
  const page = getPublicSeoPage(pageKey);

  if (!page) {
    return null;
  }

  const heroCtas = page.ctaLinks?.length
    ? page.ctaLinks
    : [
        { label: "تسجيل الدخول", href: "/login", primary: true },
        { label: "إنشاء حساب", href: "/register" },
        { label: "ابدأ الآن", href: page.startHref },
      ];

  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={getServiceBreadcrumbs(pageKey)} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              {page.eyebrow}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">{page.heroTitle}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 text-slate-300">
              <LinkifiedText text={page.heroSubtitle} maxLinks={2} />
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {heroCtas.map((cta) => (
                <Link
                  key={`${cta.href}-${cta.label}`}
                  href={cta.href}
                  className={
                    cta.primary
                      ? "rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
                      : "rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
                  }
                >
                  {cta.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {page.expertNote ? (
          <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-6 text-center shadow-xl md:p-8">
            <p className="text-lg font-bold leading-9 text-amber-100">
              <LinkifiedText text={page.expertNote} maxLinks={2} />
            </p>
          </section>
        ) : null}

        <ProseSection title="مقدمة" paragraphs={page.intro} />
        <ProseSection title="شرح الخدمة بالتفصيل" paragraphs={page.serviceExplanation} />
        <ProseSection title="لماذا يحتاجها المتداول؟" paragraphs={page.whyTraderNeeds} />

        {page.whyService ? (
          <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
            <h2 className="text-3xl font-black text-white">لماذا هذه الخدمة؟</h2>
            <p className="mt-5 text-lg leading-9 text-slate-300">
              <LinkifiedText text={page.whyService} maxLinks={2} />
            </p>
          </section>
        ) : null}

        {page.howItWorks?.length ? (
          <SectionBlock title="كيف تعمل؟" subtitle="خطوات واضحة من البداية حتى الاستفادة">
            <div className="grid gap-4 md:grid-cols-2">
              {page.howItWorks.map((step, index) => (
                <article
                  key={step.title}
                  className="public-seo-card rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-5 backdrop-blur-xl"
                >
                  <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
                    الخطوة {index + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-black text-white">
                    <LinkifiedText text={step.title} maxLinks={1} />
                  </h3>
                  <p className="mt-3 leading-8 text-slate-300">
                    <LinkifiedText text={step.text} maxLinks={2} />
                  </p>
                </article>
              ))}
            </div>
          </SectionBlock>
        ) : null}

        <ProseSection title="الأرباح والعمولات" paragraphs={page.earnings} />

        {page.terms?.length ? (
          <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
            <h2 className="text-3xl font-black text-white">شروط مختصرة</h2>
            <ul className="mt-6 space-y-4">
              {page.terms.map((term) => (
                <li
                  key={term}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-slate-200"
                >
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
                    •
                  </span>
                  <span className="leading-8">
                    <LinkifiedText text={term} maxLinks={1} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {page.whoIsItFor?.length ? (
          <SectionBlock title="لمن تناسب؟" subtitle="اختر الخدمة إذا كنت ضمن هذه الفئات">
            <ul className="grid gap-4 md:grid-cols-2">
              {page.whoIsItFor.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-slate-200"
                >
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
                    ✓
                  </span>
                  <span className="leading-8">
                    <LinkifiedText text={item} maxLinks={1} />
                  </span>
                </li>
              ))}
            </ul>
          </SectionBlock>
        ) : null}

        {page.features?.length ? (
          <SectionBlock title="مميزات الخدمة" subtitle="ما الذي تحصل عليه فعلياً؟">
            <div className="grid gap-5 md:grid-cols-2">
              {page.features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </SectionBlock>
        ) : null}

        <ProseSection title="كيف نستفيد منها؟" paragraphs={page.howWeBenefit} />

        {page.benefits?.length ? (
          <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
            <h2 className="text-3xl font-black text-white">نقاط الاستفادة العملية</h2>
            <ul className="mt-6 space-y-4">
              {page.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-slate-200"
                >
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
                    ✓
                  </span>
                  <span className="leading-8">
                    <LinkifiedText text={benefit} maxLinks={1} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {page.faq?.length ? (
          <SectionBlock title="أسئلة شائعة" subtitle="إجابات مباشرة على أكثر ما يُسأل عنه">
            <div className="space-y-3">
              {page.faq.map((item) => (
                <FaqItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </SectionBlock>
        ) : null}

        <ProseSection title="خاتمة" paragraphs={page.conclusion} />

        <RelatedServices pageKey={pageKey} />
        <PopularServices pageKey={pageKey} />

        <section className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/30 via-blue-600/20 to-cyan-400/10 p-8 text-center shadow-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">{page.ctaTitle || "جاهز للبدء؟"}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-200">
            {page.ctaText ||
              "أنشئ حسابك أو سجّل الدخول للوصول الكامل إلى الخدمة داخل HasaN CharT World."}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {(page.footerCtas || [
              { label: "إنشاء حساب مجاني", href: "/register", primary: true },
              { label: "لدي حساب بالفعل", href: "/login" },
              { label: "اذهب للخدمة", href: page.startHref },
            ]).map((cta) => (
              <Link
                key={`footer-${cta.href}-${cta.label}`}
                href={cta.href}
                className={
                  cta.primary
                    ? "rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
                    : "rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100"
                }
              >
                {cta.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import Breadcrumbs from "../seo/Breadcrumbs";
import LinkifiedText from "../seo/LinkifiedText";
import { useLazyInView } from "../../hooks/useLazyInView";
import { getPublicSeoPage } from "../../../lib/public-seo-content";
import { getRelatedServices, getServiceBreadcrumbs } from "../../../lib/internal-links";

const PRIMARY_CTA_CLASS =
  "rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]";
const SECONDARY_CTA_CLASS =
  "rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10";

function normalizeCtas(ctas = [], fallbackHref = "/register") {
  if (!ctas.length) {
    return [
      { href: fallbackHref, label: "ابدأ الآن", primary: true },
      { href: "/register", label: "إنشاء حساب" },
      { href: "/login", label: "تسجيل الدخول" },
    ];
  }

  return ctas.map((cta, index) => ({
    ...cta,
    primary: cta.primary ?? index === 0,
  }));
}

function CtaButton({ cta }) {
  return (
    <Link href={cta.href} className={cta.primary ? PRIMARY_CTA_CLASS : SECONDARY_CTA_CLASS}>
      {cta.label}
    </Link>
  );
}

function ConversionCtaBand({ title, text, ctas, compact = false }) {
  const normalizedCtas = normalizeCtas(ctas);

  if (!normalizedCtas.length) {
    return null;
  }

  return (
    <section
      className={`rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/25 via-blue-600/15 to-cyan-400/10 text-center shadow-2xl ${
        compact ? "p-6 md:p-8" : "p-8 md:p-10"
      }`}
      aria-label={title || "دعوة للإجراء"}
    >
      {title ? <h2 className="text-2xl font-black text-white md:text-3xl">{title}</h2> : null}
      {text ? (
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold leading-8 text-slate-200 md:text-lg">
          {text}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
        {normalizedCtas.map((cta) => (
          <CtaButton key={`${cta.href}-${cta.label}`} cta={cta} />
        ))}
      </div>
    </section>
  );
}

function GuestAccessBanner({ message }) {
  return (
    <section
      className="rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 p-5 shadow-lg md:p-6"
      aria-label="رسالة قبل تسجيل الدخول"
    >
      <p className="text-center text-base font-bold leading-8 text-cyan-50 md:text-lg">{message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link href="/login" className={PRIMARY_CTA_CLASS}>
          تسجيل الدخول
        </Link>
        <Link href="/register" className={SECONDARY_CTA_CLASS}>
          إنشاء حساب مجاني
        </Link>
      </div>
    </section>
  );
}

function resolvePageHubLinks(pageKey, page) {
  if (page.hubLinks?.length) {
    return page.hubLinks;
  }

  return getRelatedServices(pageKey)
    .slice(0, 6)
    .map((service) => ({
      label: service.label,
      href: service.href,
    }));
}

const RelatedServices = dynamic(() => import("./RelatedServices"));
const PopularServices = dynamic(() => import("./PopularServices"));

function FeatureCard({ icon, title, text }) {
  return (
    <article className="public-seo-card rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-xl backdrop-blur-2xl">
      <div
        aria-hidden="true"
        className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl"
      >
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
          <span aria-hidden="true" className="text-cyan-300 transition group-open:rotate-45">
            +
          </span>
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

function DeferredSeoFooter({ pageKey }) {
  const { ref, isInView } = useLazyInView({ rootMargin: "320px 0px" });

  return (
    <div ref={ref} className="space-y-8">
      {isInView ? (
        <>
          <RelatedServices pageKey={pageKey} />
          <PopularServices pageKey={pageKey} />
        </>
      ) : null}
    </div>
  );
}

export default function PublicServiceLanding({ pageKey }) {
  const page = getPublicSeoPage(pageKey);

  if (!page) {
    return null;
  }

  const heroCtas = normalizeCtas(
    page.ctaLinks?.length
      ? page.ctaLinks
      : [
          { label: "تسجيل الدخول", href: "/login", primary: true },
          { label: "إنشاء حساب", href: "/register" },
          { label: "ابدأ الآن", href: page.startHref },
        ],
    page.startHref
  );
  const footerCtas = normalizeCtas(
    page.footerCtas || [
      { label: "إنشاء حساب مجاني", href: "/register", primary: true },
      { label: "لدي حساب بالفعل", href: "/login" },
      { label: "اذهب للخدمة", href: page.startHref },
    ],
    page.startHref
  );
  const midCtas = normalizeCtas(
    page.midCta?.ctas || page.ctaLinks || footerCtas,
    page.startHref
  );
  const guestMessage =
    page.guestMessage ||
    "أنشئ حساباً مجانياً أو سجّل الدخول للوصول الكامل إلى الخدمة ومتابعة طلبك من لوحة حسابك.";
  const hubLinks = resolvePageHubLinks(pageKey, page);

  return (
    <main className="public-seo-page relative min-h-screen overflow-x-hidden overflow-y-visible bg-[#020617] text-white">
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
                <CtaButton key={`${cta.href}-${cta.label}`} cta={cta} />
              ))}
            </div>
          </div>
        </section>

        <GuestAccessBanner message={guestMessage} />

        {page.expertNote ? (
          <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-6 text-center shadow-xl md:p-8">
            <p className="text-lg font-bold leading-9 text-amber-100">
              <LinkifiedText text={page.expertNote} maxLinks={2} />
            </p>
          </section>
        ) : null}

        {page.comparisonBlocks?.length ? (
          <SectionBlock
            title="الفرق بين تحليل الخبراء والذكاء الاصطناعي"
            subtitle="التحليلات الاحترافية من خبراء السوق، والذكاء الاصطناعي أداة مساعدة منفصلة"
          >
            <div className="grid gap-5 md:grid-cols-2">
              {page.comparisonBlocks.map((block) => (
                <article
                  key={block.title}
                  className={`public-seo-card rounded-[28px] border p-6 shadow-xl backdrop-blur-2xl ${
                    block.highlight
                      ? "border-cyan-300/25 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl"
                  >
                    {block.icon}
                  </div>
                  <h3 className="mt-5 text-2xl font-black text-white">{block.title}</h3>
                  <ul className="mt-5 space-y-3">
                    {block.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-slate-200"
                      >
                        <span className="mt-1 text-cyan-300" aria-hidden="true">
                          ✓
                        </span>
                        <span className="leading-8">{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </SectionBlock>
        ) : null}

        {page.planComparisonRows?.length ? (
          <section className="public-seo-card overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] shadow-xl backdrop-blur-2xl">
            <div className="border-b border-cyan-300/10 px-6 py-5 text-center">
              <h2 className="text-2xl font-black text-white">مقارنة سريعة بين الباقات</h2>
              <p className="mt-2 text-sm font-bold text-slate-400">
                الفرق الأساسي بين Spot وFutures قبل الاشتراك
              </p>
            </div>
            <div className="public-seo-table-scroll overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-cyan-300/10 bg-cyan-400/5">
                    <th className="px-4 py-4 text-right font-black text-slate-300">الميزة</th>
                    <th className="px-4 py-4 text-right font-black text-cyan-200">Spot</th>
                    <th className="px-4 py-4 text-right font-black text-cyan-200">Futures</th>
                  </tr>
                </thead>
                <tbody>
                  {page.planComparisonRows.map((row) => (
                    <tr key={row.label} className="border-b border-white/5">
                      <td className="px-4 py-4 font-black text-white">{row.label}</td>
                      <td className="px-4 py-4 font-bold text-slate-300">{row.spot}</td>
                      <td className="px-4 py-4 font-bold text-slate-300">{row.futures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {hubLinks.length ? (
          <nav
            className="public-seo-card rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-xl backdrop-blur-2xl"
            aria-label="خدمات مرتبطة"
          >
            <h2 className="text-center text-2xl font-black text-white">خدمات مرتبطة قد تهمك</h2>
            <p className="mt-2 text-center text-sm font-bold text-slate-400">
              انتقل مباشرة إلى خدمات HasaN CharT World ذات الصلة
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {hubLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 no-underline transition hover:bg-cyan-400/20"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
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

        <ConversionCtaBand
          title={page.midCta?.title || "هل أنت مستعد للخطوة التالية؟"}
          text={
            page.midCta?.text ||
            page.ctaText ||
            "اختر الإجراء المناسب واستكمل من لوحة حسابك خلال دقائق."
          }
          ctas={midCtas}
          compact
        />

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

        <DeferredSeoFooter pageKey={pageKey} />

        <section className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/30 via-blue-600/20 to-cyan-400/10 p-8 text-center shadow-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">{page.ctaTitle || "جاهز للبدء؟"}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-200">
            {page.ctaText ||
              "أنشئ حسابك أو سجّل الدخول للوصول الكامل إلى الخدمة داخل HasaN CharT World."}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {footerCtas.map((cta) => (
              <CtaButton key={`footer-${cta.href}-${cta.label}`} cta={cta} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

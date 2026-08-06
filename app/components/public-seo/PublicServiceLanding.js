"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import Breadcrumbs from "../seo/Breadcrumbs";
import LinkifiedText from "../seo/LinkifiedText";
import { useLazyInView } from "../../hooks/useLazyInView";
import { getPublicSeoPage } from "../../../lib/public-seo-content";
import {
  getRelatedServices,
  getServiceBreadcrumbs,
} from "../../../lib/internal-links";
const PRIMARY_CTA_CLASS = "ui-public-seo-cta-primary";
const SECONDARY_CTA_CLASS = "ui-public-seo-cta-secondary";
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
    <Link
      href={cta.href}
      className={cta.primary ? PRIMARY_CTA_CLASS : SECONDARY_CTA_CLASS}
    >
      {" "}
      {cta.label}{" "}
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
      className={`rounded-[34px] border admin-panel-border admin-panel text-center shadow-2xl ${compact ? "p-6 md:p-8" : "p-8 md:p-10"}`}
      aria-label={title || "دعوة للإجراء"}
    >
      {" "}
      {title ? (
        <h2 className="ui-public-seo-title ui-public-seo-title--card">
          {title}
        </h2>
      ) : null}{" "}
      {text ? (
        <p className="mx-auto mt-4 max-w-2xl text-base font-bold leading-8 ui-public-seo-body md:text-lg">
          {" "}
          {text}{" "}
        </p>
      ) : null}{" "}
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
        {" "}
        {normalizedCtas.map((cta) => (
          <CtaButton key={`${cta.href}-${cta.label}`} cta={cta} />
        ))}{" "}
      </div>{" "}
    </section>
  );
}
function GuestAccessBanner({ message }) {
  return (
    <section
      className="ui-public-seo-guest-banner"
      aria-label="رسالة قبل تسجيل الدخول"
    >
      {" "}
      <p className="ui-public-seo-guest-banner__text">{message}</p>{" "}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {" "}
        <Link href="/login" className={PRIMARY_CTA_CLASS}>
          {" "}
          تسجيل الدخول{" "}
        </Link>{" "}
        <Link href="/register" className={SECONDARY_CTA_CLASS}>
          {" "}
          إنشاء حساب مجاني{" "}
        </Link>{" "}
      </div>{" "}
    </section>
  );
}
function resolvePageHubLinks(pageKey, page) {
  if (page.hubLinks?.length) {
    return page.hubLinks;
  }
  return getRelatedServices(pageKey)
    .slice(0, 6)
    .map((service) => ({ label: service.label, href: service.href }));
}
const RelatedServices = dynamic(() => import("./RelatedServices"));
const PopularServices = dynamic(() => import("./PopularServices"));
function FeatureCard({ icon, title, text }) {
  return (
    <article className="ui-public-seo-card ui-public-seo-card--compact public-seo-card">
      {" "}
      <div
        aria-hidden="true"
        className="grid h-14 w-14 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl"
      >
        {" "}
        {icon}{" "}
      </div>{" "}
      <h3 className="mt-5 ui-public-seo-title ui-public-seo-title--card text-xl">
        {" "}
        <LinkifiedText text={title} maxLinks={1} />{" "}
      </h3>{" "}
      <p className="mt-3 leading-8 ui-public-seo-body">
        {" "}
        <LinkifiedText text={text} maxLinks={2} />{" "}
      </p>{" "}
    </article>
  );
}
function FaqItem({ question, answer }) {
  return (
    <details className="ui-public-seo-card ui-public-seo-card--faq group public-seo-card">
      {" "}
      <summary className="cursor-pointer list-none ui-public-seo-title text-lg marker:content-none">
        {" "}
        <span className="flex items-center justify-between gap-4">
          {" "}
          <LinkifiedText text={question} maxLinks={1} />{" "}
          <span
            aria-hidden="true"
            className="admin-text-muted transition group-open:rotate-45"
          >
            {" "}
            +{" "}
          </span>{" "}
        </span>{" "}
      </summary>{" "}
      <p className="ui-public-seo-body mt-4">
        {" "}
        <LinkifiedText text={answer} maxLinks={2} />{" "}
      </p>{" "}
    </details>
  );
}
function SectionBlock({ title, subtitle, children }) {
  return (
    <section className="space-y-5">
      {" "}
      <div className="text-center">
        {" "}
        <h2 className="ui-public-seo-title ui-public-seo-title--section">
          {title}
        </h2>{" "}
        {subtitle ? (
          <p className="ui-public-seo-subtitle mt-3">{subtitle}</p>
        ) : null}{" "}
      </div>{" "}
      {children}{" "}
    </section>
  );
}
function ProseSection({ title, paragraphs }) {
  if (!paragraphs?.length) return null;
  return (
    <section className="ui-public-seo-card public-seo-card">
      {" "}
      <h2 className="ui-public-seo-title ui-public-seo-title--section">
        {title}
      </h2>{" "}
      <div className="mt-6 space-y-5">
        {" "}
        {paragraphs.map((paragraph) => (
          <p
            key={paragraph.slice(0, 48)}
            className="text-lg leading-9 ui-public-seo-body"
          >
            {" "}
            <LinkifiedText text={paragraph} maxLinks={2} />{" "}
          </p>
        ))}{" "}
      </div>{" "}
    </section>
  );
}
function DeferredSeoFooter({ pageKey }) {
  const { ref, isInView } = useLazyInView({ rootMargin: "320px 0px" });
  return (
    <div ref={ref} className="space-y-8">
      {" "}
      {isInView ? (
        <>
          {" "}
          <RelatedServices pageKey={pageKey} />{" "}
          <PopularServices pageKey={pageKey} />{" "}
        </>
      ) : null}{" "}
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
    page.startHref,
  );
  const footerCtas = normalizeCtas(
    page.footerCtas || [
      { label: "إنشاء حساب مجاني", href: "/register", primary: true },
      { label: "لدي حساب بالفعل", href: "/login" },
      { label: "اذهب للخدمة", href: page.startHref },
    ],
    page.startHref,
  );
  const midCtas = normalizeCtas(
    page.midCta?.ctas || page.ctaLinks || footerCtas,
    page.startHref,
  );
  const guestMessage =
    page.guestMessage ||
    "أنشئ حساباً مجانياً أو سجّل الدخول للوصول الكامل إلى الخدمة ومتابعة طلبك من لوحة حسابك.";
  const hubLinks = resolvePageHubLinks(pageKey, page);
  return (
    <main className="ui-public-seo-page public-seo-page ui-text-strong overflow-x-hidden overflow-y-visible">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        {" "}
        <Breadcrumbs
          items={getServiceBreadcrumbs(pageKey)}
          variant="dark"
        />{" "}
        <section className="ui-public-seo-hero public-seo-hero">
          {" "}
          <div className="ui-public-seo-hero-glow ui-public-seo-hero-glow--primary ui-public-seo-hero-glow--left-lg" />{" "}
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full admin-panel blur-3xl" />{" "}
          <div className="relative z-10">
            {" "}
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              {page.eyebrow}{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              {page.heroTitle}
            </h1>{" "}
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 ui-public-seo-body">
              {" "}
              <LinkifiedText text={page.heroSubtitle} maxLinks={2} />{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              {heroCtas.map((cta) => (
                <CtaButton key={`${cta.href}-${cta.label}`} cta={cta} />
              ))}{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <GuestAccessBanner message={guestMessage} />{" "}
        {page.expertNote ? (
          <section className="ui-panel-warning rounded-[28px] text-center shadow-xl md:p-8">
            {" "}
            <p className="text-lg font-bold leading-9 ui-panel-warning__title">
              {" "}
              <LinkifiedText text={page.expertNote} maxLinks={2} />{" "}
            </p>{" "}
          </section>
        ) : null}{" "}
        {page.comparisonBlocks?.length ? (
          <SectionBlock
            title="الفرق بين تحليل الخبراء والذكاء الاصطناعي"
            subtitle="التحليلات الاحترافية من خبراء السوق، والذكاء الاصطناعي أداة مساعدة منفصلة"
          >
            {" "}
            <div className="grid gap-5 md:grid-cols-2">
              {" "}
              {page.comparisonBlocks.map((block) => (
                <article
                  key={block.title}
                  className={`public-seo-card rounded-[28px] border p-6 shadow-xl backdrop-blur-2xl ${block.highlight ? "admin-panel-border admin-panel" : "admin-panel-border ui-glass-04"}`}
                >
                  {" "}
                  <div
                    aria-hidden="true"
                    className="grid h-14 w-14 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl"
                  >
                    {" "}
                    {block.icon}{" "}
                  </div>{" "}
                  <h3 className="mt-5 ui-public-seo-title ui-public-seo-title--card">
                    {block.title}
                  </h3>{" "}
                  <ul className="mt-5 space-y-3">
                    {" "}
                    {block.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 rounded-2xl border admin-panel-border admin-panel px-4 py-3 ui-public-seo-body"
                      >
                        {" "}
                        <span
                          className="mt-1 admin-text-muted"
                          aria-hidden="true"
                        >
                          {" "}
                          ✓{" "}
                        </span>{" "}
                        <span className="leading-8">{point}</span>{" "}
                      </li>
                    ))}{" "}
                  </ul>{" "}
                </article>
              ))}{" "}
            </div>{" "}
          </SectionBlock>
        ) : null}{" "}
        {page.planComparisonRows?.length ? (
          <section className="ui-public-seo-card ui-public-seo-card--compact public-seo-card overflow-hidden shadow-xl">
            {" "}
            <div className="border-b admin-panel-border px-6 py-5 text-center">
              {" "}
              <h2 className="ui-public-seo-title ui-public-seo-title--card">
                مقارنة سريعة بين الباقات
              </h2>{" "}
              <p className="mt-2 text-sm font-bold ui-public-seo-subtitle">
                {" "}
                الفرق الأساسي بين Spot وFutures قبل الاشتراك{" "}
              </p>{" "}
            </div>{" "}
            <div className="public-seo-table-scroll overflow-x-auto">
              {" "}
              <table className="min-w-full text-sm">
                {" "}
                <thead>
                  {" "}
                  <tr className="border-b admin-panel-border admin-panel">
                    {" "}
                    <th className="px-4 py-4 text-right font-black ui-public-seo-body">
                      الميزة
                    </th>{" "}
                    <th className="px-4 py-4 text-right font-black admin-text-muted">
                      Spot
                    </th>{" "}
                    <th className="px-4 py-4 text-right font-black admin-text-muted">
                      Futures
                    </th>{" "}
                  </tr>{" "}
                </thead>{" "}
                <tbody>
                  {" "}
                  {page.planComparisonRows.map((row) => (
                    <tr key={row.label} className="border-b admin-panel-border">
                      {" "}
                      <td className="px-4 py-4 font-black ui-public-seo-title">
                        {row.label}
                      </td>{" "}
                      <td className="px-4 py-4 font-bold ui-public-seo-body">
                        {row.spot}
                      </td>{" "}
                      <td className="px-4 py-4 font-bold ui-public-seo-body">
                        {row.futures}
                      </td>{" "}
                    </tr>
                  ))}{" "}
                </tbody>{" "}
              </table>{" "}
            </div>{" "}
          </section>
        ) : null}{" "}
        {hubLinks.length ? (
          <nav
            className="ui-public-seo-card ui-public-seo-card--compact public-seo-card"
            aria-label="خدمات مرتبطة"
          >
            {" "}
            <h2 className="text-center ui-public-seo-title ui-public-seo-title--card">
              خدمات مرتبطة قد تهمك
            </h2>{" "}
            <p className="mt-2 text-center text-sm font-bold ui-public-seo-subtitle">
              {" "}
              انتقل مباشرة إلى خدمات HasaN CharT World ذات الصلة{" "}
            </p>{" "}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {" "}
              {hubLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border admin-panel-border admin-panel px-4 py-2 text-sm font-black no-underline transition hover:admin-panel"
                >
                  {" "}
                  {link.label}{" "}
                </Link>
              ))}{" "}
            </div>{" "}
          </nav>
        ) : null}{" "}
        <ProseSection title="مقدمة" paragraphs={page.intro} />{" "}
        <ProseSection
          title="شرح الخدمة بالتفصيل"
          paragraphs={page.serviceExplanation}
        />{" "}
        <ProseSection
          title="لماذا يحتاجها المتداول؟"
          paragraphs={page.whyTraderNeeds}
        />{" "}
        {page.whyService ? (
          <section className="ui-public-seo-card public-seo-card">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              لماذا هذه الخدمة؟
            </h2>{" "}
            <p className="mt-5 text-lg leading-9 ui-public-seo-body">
              {" "}
              <LinkifiedText text={page.whyService} maxLinks={2} />{" "}
            </p>{" "}
          </section>
        ) : null}{" "}
        {page.howItWorks?.length ? (
          <SectionBlock
            title="كيف تعمل؟"
            subtitle="خطوات واضحة من البداية حتى الاستفادة"
          >
            {" "}
            <div className="grid gap-4 md:grid-cols-2">
              {" "}
              {page.howItWorks.map((step, index) => (
                <article
                  key={step.title}
                  className="ui-public-seo-card ui-public-seo-card--faq public-seo-card"
                >
                  {" "}
                  <span className="inline-flex rounded-full border admin-panel-border admin-panel px-3 py-1 text-xs font-black admin-text-muted">
                    {" "}
                    الخطوة {index + 1}{" "}
                  </span>{" "}
                  <h3 className="mt-4 ui-public-seo-title ui-public-seo-title--card text-xl">
                    {" "}
                    <LinkifiedText text={step.title} maxLinks={1} />{" "}
                  </h3>{" "}
                  <p className="mt-3 leading-8 ui-public-seo-body">
                    {" "}
                    <LinkifiedText text={step.text} maxLinks={2} />{" "}
                  </p>{" "}
                </article>
              ))}{" "}
            </div>{" "}
          </SectionBlock>
        ) : null}{" "}
        <ProseSection title="الأرباح والعمولات" paragraphs={page.earnings} />{" "}
        {page.terms?.length ? (
          <section className="ui-public-seo-card public-seo-card">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              شروط مختصرة
            </h2>{" "}
            <ul className="mt-6 space-y-4">
              {" "}
              {page.terms.map((term) => (
                <li key={term} className="ui-public-seo-list-item">
                  {" "}
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full admin-panel admin-text-muted">
                    {" "}
                    •{" "}
                  </span>{" "}
                  <span className="leading-8">
                    {" "}
                    <LinkifiedText text={term} maxLinks={1} />{" "}
                  </span>{" "}
                </li>
              ))}{" "}
            </ul>{" "}
          </section>
        ) : null}{" "}
        {page.whoIsItFor?.length ? (
          <SectionBlock
            title="لمن تناسب؟"
            subtitle="اختر الخدمة إذا كنت ضمن هذه الفئات"
          >
            {" "}
            <ul className="grid gap-4 md:grid-cols-2">
              {" "}
              {page.whoIsItFor.map((item) => (
                <li key={item} className="ui-public-seo-list-item">
                  {" "}
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full admin-panel admin-text-muted">
                    {" "}
                    ✓{" "}
                  </span>{" "}
                  <span className="leading-8">
                    {" "}
                    <LinkifiedText text={item} maxLinks={1} />{" "}
                  </span>{" "}
                </li>
              ))}{" "}
            </ul>{" "}
          </SectionBlock>
        ) : null}{" "}
        {page.features?.length ? (
          <SectionBlock
            title="مميزات الخدمة"
            subtitle="ما الذي تحصل عليه فعلياً؟"
          >
            {" "}
            <div className="grid gap-5 md:grid-cols-2">
              {" "}
              {page.features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}{" "}
            </div>{" "}
          </SectionBlock>
        ) : null}{" "}
        <ConversionCtaBand
          title={page.midCta?.title || "هل أنت مستعد للخطوة التالية؟"}
          text={
            page.midCta?.text ||
            page.ctaText ||
            "اختر الإجراء المناسب واستكمل من لوحة حسابك خلال دقائق."
          }
          ctas={midCtas}
          compact
        />{" "}
        <ProseSection title="كيف نستفيد منها؟" paragraphs={page.howWeBenefit} />{" "}
        {page.benefits?.length ? (
          <section className="ui-public-seo-card public-seo-card">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              نقاط الاستفادة العملية
            </h2>{" "}
            <ul className="mt-6 space-y-4">
              {" "}
              {page.benefits.map((benefit) => (
                <li key={benefit} className="ui-public-seo-list-item">
                  {" "}
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full admin-panel admin-text-muted">
                    {" "}
                    ✓{" "}
                  </span>{" "}
                  <span className="leading-8">
                    {" "}
                    <LinkifiedText text={benefit} maxLinks={1} />{" "}
                  </span>{" "}
                </li>
              ))}{" "}
            </ul>{" "}
          </section>
        ) : null}{" "}
        {page.faq?.length ? (
          <SectionBlock
            title="أسئلة شائعة"
            subtitle="إجابات مباشرة على أكثر ما يُسأل عنه"
          >
            {" "}
            <div className="space-y-3">
              {" "}
              {page.faq.map((item) => (
                <FaqItem key={item.q} question={item.q} answer={item.a} />
              ))}{" "}
            </div>{" "}
          </SectionBlock>
        ) : null}{" "}
        <ProseSection title="خاتمة" paragraphs={page.conclusion} />{" "}
        <DeferredSeoFooter pageKey={pageKey} />{" "}
        <section className="ui-public-seo-cta-band ui-public-seo-cta-band--full">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            {page.ctaTitle || "جاهز للبدء؟"}
          </h2>{" "}
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 ui-public-seo-body">
            {" "}
            {page.ctaText ||
              "أنشئ حسابك أو سجّل الدخول للوصول الكامل إلى الخدمة داخل HasaN CharT World."}{" "}
          </p>{" "}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {" "}
            {footerCtas.map((cta) => (
              <CtaButton key={`footer-${cta.href}-${cta.label}`} cta={cta} />
            ))}{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}

"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "مراكز الأصول", href: "/assets" },
]; /** * @param {{ * name: string, * nameEn: string, * symbol: string, * path: string, * categoryLabel: string, * summary: string, * }} asset */
function AssetIndexCard({ asset }) {
  return (
    <Link
      href={asset.path}
      className="public-seo-card group flex h-full flex-col rounded-[24px] border admin-panel-border ui-glass-04 p-6 no-underline backdrop-blur-xl transition hover:admin-panel-border hover:ui-glass-solid/[0.07]"
    >
      {" "}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {" "}
        <div>
          {" "}
          <h3 className="ui-public-seo-title ui-public-seo-title--card text-xl transition group-hover:">
            {" "}
            {asset.name}{" "}
          </h3>{" "}
          <p className="mt-1 text-sm font-bold ui-public-seo-subtitle">
            {asset.nameEn}
          </p>{" "}
        </div>{" "}
        <span className="rounded-full border admin-panel-border admin-panel px-3 py-1 text-xs font-black admin-text-muted">
          {" "}
          {asset.symbol}{" "}
        </span>{" "}
      </div>{" "}
      <span className="mt-4 inline-flex w-fit rounded-full border admin-panel-border admin-panel px-3 py-1 text-xs font-bold ui-public-seo-body">
        {" "}
        {asset.categoryLabel}{" "}
      </span>{" "}
      <p className="mt-4 flex-1 text-sm leading-7 ui-public-seo-subtitle line-clamp-3">
        {asset.summary}
      </p>{" "}
      <span className="mt-5 text-sm font-black admin-text-muted transition group-hover:">
        {" "}
        فتح مركز {asset.symbol} ←{" "}
      </span>{" "}
    </Link>
  );
} /** * @param {{ * groups: Array<{ * id: string, * label: string, * icon: string, * count: number, * items: Array<Record<string, string>>, * }>, * allItems: Array<Record<string, string>>, * totalCount: number, * }} props */
export default function AssetsIndexPage({ groups, allItems, totalCount }) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesFilter =
        activeFilter === "all" || item.categoryId === activeFilter;
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        item.name,
        item.nameEn,
        item.symbol,
        item.categoryLabel,
        item.summary,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [allItems, activeFilter, normalizedQuery]);
  const visibleGroups = useMemo(() => {
    if (activeFilter !== "all") {
      const group = groups.find((g) => g.id === activeFilter);
      if (!group) return [];
      return [{ ...group, items: filteredItems }];
    }
    return groups
      .map((group) => ({
        ...group,
        items: filteredItems.filter((item) => item.categoryId === group.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, filteredItems, activeFilter]);
  return (
    <main className="ui-public-seo-page public-seo-page ui-text-strong">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        {" "}
        <Breadcrumbs items={breadcrumbs} variant="dark" />{" "}
        <section className="ui-public-seo-hero public-seo-hero">
          {" "}
          <div className="relative z-10">
            {" "}
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              Assets Index — Asset Hub{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-5xl">
              دليل مراكز الأصول
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              كل صفحات Asset Hub في مكان واحد: العملات الرقمية، الفوركس،
              المعادن، الطاقة، والمؤشرات — مع السعر المباشر، الشارت، الأخبار،
              والتحليلات لكل أصل.{" "}
            </p>{" "}
            <p className="mt-4 text-sm font-bold admin-text-muted">
              {totalCount} مركز أصول متاح
            </p>{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card space-y-5 rounded-[34px] border admin-panel-border ui-glass-045 p-6 shadow-2xl backdrop-blur-2xl md:p-8">
          {" "}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {" "}
            <label className="block flex-1">
              {" "}
              <span className="mb-2 block text-sm font-black ui-public-seo-body">
                بحث داخل الأصول
              </span>{" "}
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالاسم، الرمز، أو الفئة..."
                className="w-full rounded-2xl border admin-panel-border admin-panel px-5 py-4 ui-public-seo-title outline-none transition placeholder:ui-public-seo-subtitle focus:admin-panel-border"
              />{" "}
            </label>{" "}
            <p className="text-sm font-bold ui-public-seo-subtitle">
              {" "}
              {filteredItems.length} نتيجة{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap gap-2">
            {" "}
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${activeFilter === "all" ? "admin-panel-border admin-panel ui-public-seo-title" : "admin-panel-border admin-panel ui-public-seo-body hover:admin-panel-border"}`}
            >
              {" "}
              الكل ({totalCount}){" "}
            </button>{" "}
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveFilter(group.id)}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${activeFilter === group.id ? "admin-panel-border admin-panel ui-public-seo-title" : "admin-panel-border admin-panel ui-public-seo-body hover:admin-panel-border"}`}
              >
                {" "}
                {group.icon} {group.label} ({group.count}){" "}
              </button>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        {visibleGroups.length === 0 ? (
          <section className="public-seo-card rounded-[34px] border border-dashed admin-panel-border ui-glass-03 p-10 text-center">
            {" "}
            <p className="ui-public-seo-title ui-public-seo-title--card text-xl">
              لا توجد نتائج مطابقة
            </p>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              جرّب كلمة بحث أخرى أو اختر فئة مختلفة.
            </p>{" "}
          </section>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.id} className="space-y-5">
              {" "}
              <div className="flex items-center gap-3">
                {" "}
                <span className="grid h-12 w-12 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl">
                  {" "}
                  {group.icon}{" "}
                </span>{" "}
                <div>
                  {" "}
                  <h2 className="ui-public-seo-title ui-public-seo-title--card">
                    {group.label}
                  </h2>{" "}
                  <p className="mt-1 text-sm ui-public-seo-subtitle">
                    {group.items.length} أصل
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {" "}
                {group.items.map((asset) => (
                  <AssetIndexCard key={asset.id} asset={asset} />
                ))}{" "}
              </div>{" "}
            </section>
          ))
        )}{" "}
        <section className="flex flex-wrap justify-center gap-3">
          {" "}
          <Link
            href="/markets"
            className="rounded-full border admin-panel-border admin-panel px-5 py-3 text-sm font-black no-underline transition hover:admin-panel"
          >
            {" "}
            الأسواق المالية{" "}
          </Link>{" "}
          <Link
            href="/daily-analysis"
            className="rounded-full border admin-panel-border admin-panel px-5 py-3 text-sm font-black no-underline transition hover:admin-panel"
          >
            {" "}
            التحليلات اليومية{" "}
          </Link>{" "}
          <Link
            href="/news"
            className="rounded-full border admin-panel-border admin-panel px-5 py-3 text-sm font-black no-underline transition hover:admin-panel"
          >
            {" "}
            الأخبار الاقتصادية{" "}
          </Link>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}

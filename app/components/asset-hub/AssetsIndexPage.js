"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "مراكز الأصول", href: "/assets" },
];

/**
 * @param {{
 *   name: string,
 *   nameEn: string,
 *   symbol: string,
 *   path: string,
 *   categoryLabel: string,
 *   summary: string,
 * }} asset
 */
function AssetIndexCard({ asset }) {
  return (
    <Link
      href={asset.path}
      className="public-seo-card group flex h-full flex-col rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-6 no-underline backdrop-blur-xl transition hover:border-cyan-300/35 hover:bg-white/[0.07]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white transition group-hover:text-cyan-100">
            {asset.name}
          </h3>
          <p className="mt-1 text-sm font-bold text-slate-400">{asset.nameEn}</p>
        </div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
          {asset.symbol}
        </span>
      </div>
      <span className="mt-4 inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300">
        {asset.categoryLabel}
      </span>
      <p className="mt-4 flex-1 text-sm leading-7 text-slate-400 line-clamp-3">{asset.summary}</p>
      <span className="mt-5 text-sm font-black text-cyan-300 transition group-hover:text-cyan-100">
        فتح مركز {asset.symbol} ←
      </span>
    </Link>
  );
}

/**
 * @param {{
 *   groups: Array<{
 *     id: string,
 *     label: string,
 *     icon: string,
 *     count: number,
 *     items: Array<Record<string, string>>,
 *   }>,
 *   allItems: Array<Record<string, string>>,
 *   totalCount: number,
 * }} props
 */
export default function AssetsIndexPage({ groups, allItems, totalCount }) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesFilter = activeFilter === "all" || item.categoryId === activeFilter;
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [item.name, item.nameEn, item.symbol, item.categoryLabel, item.summary]
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
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              Assets Index — Asset Hub
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-5xl">دليل مراكز الأصول</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              كل صفحات Asset Hub في مكان واحد: العملات الرقمية، الفوركس، المعادن، الطاقة،
              والمؤشرات — مع السعر المباشر، الشارت، الأخبار، والتحليلات لكل أصل.
            </p>
            <p className="mt-4 text-sm font-bold text-cyan-200">{totalCount} مركز أصول متاح</p>
          </div>
        </section>

        <section className="public-seo-card space-y-5 rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <label className="block flex-1">
              <span className="mb-2 block text-sm font-black text-slate-300">بحث داخل الأصول</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث بالاسم، الرمز، أو الفئة..."
                className="w-full rounded-2xl border border-cyan-300/20 bg-black/30 px-5 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
              />
            </label>
            <p className="text-sm font-bold text-slate-400">
              {filteredItems.length} نتيجة
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                activeFilter === "all"
                  ? "border-cyan-300/40 bg-cyan-400/20 text-white"
                  : "border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/25"
              }`}
            >
              الكل ({totalCount})
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveFilter(group.id)}
                className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                  activeFilter === group.id
                    ? "border-cyan-300/40 bg-cyan-400/20 text-white"
                    : "border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/25"
                }`}
              >
                {group.icon} {group.label} ({group.count})
              </button>
            ))}
          </div>
        </section>

        {visibleGroups.length === 0 ? (
          <section className="public-seo-card rounded-[34px] border border-dashed border-cyan-300/25 bg-white/[0.03] p-10 text-center">
            <p className="text-xl font-black text-white">لا توجد نتائج مطابقة</p>
            <p className="mt-3 text-slate-400">جرّب كلمة بحث أخرى أو اختر فئة مختلفة.</p>
          </section>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.id} className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
                  {group.icon}
                </span>
                <div>
                  <h2 className="text-2xl font-black text-white md:text-3xl">{group.label}</h2>
                  <p className="mt-1 text-sm text-slate-400">{group.items.length} أصل</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((asset) => (
                  <AssetIndexCard key={asset.id} asset={asset} />
                ))}
              </div>
            </section>
          ))
        )}

        <section className="flex flex-wrap justify-center gap-3">
          <Link
            href="/markets"
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 no-underline transition hover:bg-cyan-400/20"
          >
            الأسواق المالية
          </Link>
          <Link
            href="/daily-analysis"
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 no-underline transition hover:bg-cyan-400/20"
          >
            التحليلات اليومية
          </Link>
          <Link
            href="/news"
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 no-underline transition hover:bg-cyan-400/20"
          >
            الأخبار الاقتصادية
          </Link>
        </section>
      </div>
    </main>
  );
}

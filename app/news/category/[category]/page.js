

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.hasanchartworld.com";

const CATEGORY_CONFIG = {
  geopolitics: {
    title: "أخبار جيوسياسية",
    description: "آخر الأخبار الجيوسياسية وتأثيرها على الأسواق العالمية.",
  },
  economy: {
    title: "الاقتصاد الأمريكي",
    description: "أهم أخبار الفيدرالي والتضخم والوظائف والاقتصاد الأمريكي.",
  },
  stocks: {
    title: "الأسواق العالمية",
    description: "متابعة الأسهم والمؤشرات العالمية ونتائج الشركات.",
  },
  crypto: {
    title: "العملات الرقمية",
    description: "أخبار البيتكوين والعملات الرقمية وأسواق الكريبتو.",
  },
  commodities: {
    title: "النفط والطاقة",
    description: "أخبار النفط والذهب والسلع والطاقة العالمية.",
  },
};

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function detectCategory(item) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();

  if (/bitcoin|btc|crypto|ethereum/.test(text)) return "crypto";
  if (/gold|oil|silver|commodit/.test(text)) return "commodities";
  if (/nasdaq|dow|s&p|stock|earnings/.test(text)) return "stocks";
  if (/fed|inflation|cpi|pmi|gdp|jobs/.test(text)) return "economy";
  if (/iran|israel|war|ukraine|russia|gaza/.test(text)) return "geopolitics";

  return "stocks";
}

export async function generateMetadata({ params }) {
  const config = CATEGORY_CONFIG[params.category];

  if (!config) {
    return {
      title: "الأخبار - HasaN CharT World",
    };
  }

  return {
    title: `${config.title} | HasaN CharT World`,
    description: config.description,
    alternates: {
      canonical: `${SITE_URL}/news/category/${params.category}`,
    },
  };
}

export default async function CategoryPage({ params }) {
  const config = CATEGORY_CONFIG[params.category];

  if (!config) {
    return (
      <main className="p-10 text-center">
        <h1>التصنيف غير موجود</h1>
      </main>
    );
  }

  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from("news_posts")
    .select("id,title,content,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const news = (data || []).filter(
    (item) => detectCategory(item) === params.category
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-4xl font-black">{config.title}</h1>
        <p className="text-slate-500">{config.description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {news.map((item) => (
          <Link
            key={item.id}
            href={`/news/${item.id}`}
            className="rounded-3xl border border-slate-200 bg-white p-6 no-underline shadow-sm transition hover:shadow-xl"
          >
            <h2 className="mb-3 text-xl font-black text-slate-900">
              {item.title || "خبر اقتصادي"}
            </h2>
            <p className="line-clamp-3 text-slate-600">
              {String(item.content || "").slice(0, 220)}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
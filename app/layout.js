import "./globals.css";
import { ClientProviders } from "./components/ClientProviders";
import RootLayoutShell from "./components/RootLayoutShell";
import { readThemeFromRequestCookies } from "../lib/theme-server";
import { THEME_BOOT_SCRIPT, THEME_CRITICAL_CSS } from "../lib/theme-critical-styles";
import {
  SITE_ORGANIZATION_NAME,
  buildPublicMetadata,
  buildSiteEntityGraph,
  serializeJsonLd,
} from "../lib/seo";
import { getSupabaseOrigin } from "../lib/external-origin-hints";

const ROOT_TITLE = "HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول";
const ROOT_DESCRIPTION =
  "HasaN CharT World منصة احترافية لمتابعة أسواق المال، تشمل تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، تنبيهات سعرية، أخبار اقتصادية، وطلبات تحليل العملات.";
const ROOT_OG_DESCRIPTION =
  "منصة HasaN CharT World تقدم تحليلات للأسواق المالية، توصيات Spot و Futures، أخبار اقتصادية، تنبيهات سعرية، وخدمات احترافية للمتداولين.";
const ROOT_TWITTER_DESCRIPTION =
  "تابع تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، الأخبار الاقتصادية، والتنبيهات السعرية عبر منصة HasaN CharT World.";

export const metadata = {
  ...buildPublicMetadata({
    path: "/",
    title: { default: ROOT_TITLE },
    description: ROOT_DESCRIPTION,
    keywords: [
      "HasaN CharT World",
      "حسن شارت",
      "تحليل بيتكوين",
      "تحليل العملات الرقمية",
      "توصيات كريبتو",
      "توصيات فوركس",
      "توصيات Spot",
      "توصيات Futures",
      "أخبار اقتصادية",
      "تنبيهات سعرية",
      "إدارة حسابات التداول",
    ],
    openGraph: {
      title: ROOT_TITLE,
      description: ROOT_OG_DESCRIPTION,
    },
    twitter: {
      title: ROOT_TITLE,
      description: ROOT_TWITTER_DESCRIPTION,
    },
  }),
  applicationName: SITE_ORGANIZATION_NAME,
  appleWebApp: {
    title: SITE_ORGANIZATION_NAME,
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "1024x1024" }],
    shortcut: "/favicon.png",
    apple: [{ url: "/favicon.png", sizes: "1024x1024" }],
  },
};

export const viewport = {
  themeColor: "#020617",
};

export default async function RootLayout({ children }) {
  const theme = await readThemeFromRequestCookies();
  const supabaseOrigin = getSupabaseOrigin();

  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme={theme}
      className="theme-pending"
      suppressHydrationWarning
    >
      <head>
        <link rel="dns-prefetch" href="https://s3.tradingview.com" />
        <link rel="dns-prefetch" href="https://s.tradingview.com" />
        {supabaseOrigin ? <link rel="dns-prefetch" href={supabaseOrigin} /> : null}
        <style dangerouslySetInnerHTML={{ __html: THEME_CRITICAL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(buildSiteEntityGraph()),
          }}
        />
      </head>
      <body className="min-h-screen bg-[#020617] text-white antialiased overflow-x-hidden theme-pending-body">
        <div
          id="theme-boot-loader"
          aria-live="polite"
          aria-busy="true"
          aria-label="جاري تحميل منصة HasaN CharT World"
        >
          <div className="theme-boot-logo">HC</div>
          <div className="theme-boot-spinner" aria-hidden="true" />
          <p className="theme-boot-title">HasaN CharT World</p>
          <p className="theme-boot-subtitle">جاري تجهيز الواجهة...</p>
        </div>
        <div id="site-root">
          <ClientProviders initialTheme={theme}>
            <RootLayoutShell>{children}</RootLayoutShell>
          </ClientProviders>
        </div>
      </body>
    </html>
  );
}

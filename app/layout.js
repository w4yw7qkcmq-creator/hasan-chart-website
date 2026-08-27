import "./globals.css";
import { THEME_COOKIE_BOOT_SCRIPT, THEME_CRITICAL_CSS } from "../lib/theme-critical-styles";
import { THEME_COLOR_DARK } from "../lib/theme-shared";
import { ThemeProvider } from "./components/ThemeProvider";
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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon-32.png",
    apple: [{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export function generateViewport() {
  return {
    themeColor: THEME_COLOR_DARK,
  };
}

export default function RootLayout({ children }) {
  const supabaseOrigin = getSupabaseOrigin();

  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_COOKIE_BOOT_SCRIPT }} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/favicon-192.png" sizes="192x192" />
        <link rel="dns-prefetch" href="https://s3.tradingview.com" />
        <link rel="dns-prefetch" href="https://s.tradingview.com" />
        {supabaseOrigin ? <link rel="dns-prefetch" href={supabaseOrigin} /> : null}
        <style dangerouslySetInnerHTML={{ __html: THEME_CRITICAL_CSS }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(buildSiteEntityGraph()),
          }}
        />
      </head>
      <body className="site-body min-h-screen antialiased">
        <ThemeProvider>
          <div id="site-root">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}

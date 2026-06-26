import "./globals.css";
import { AppProviders } from "./components/AppProviders";
import RootLayoutShell from "./components/RootLayoutShell";
import { readThemeFromRequestCookies } from "../lib/theme-server";
import { THEME_BOOT_SCRIPT, THEME_CRITICAL_CSS } from "../lib/theme-critical-styles";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HasaN CharT World",
  alternateName: ["HasaN CharT", "Hasan Chart World", "حسن شارت"],
  url: "https://www.hasanchartworld.com",
  description:
    "منصة احترافية لمتابعة أسواق المال، تحليلات العملات الرقمية والفوركس، توصيات التداول، الأخبار الاقتصادية والتنبيهات السعرية.",
  publisher: {
    "@type": "Organization",
    name: "HasaN CharT World",
    logo: {
      "@type": "ImageObject",
      url: "https://www.hasanchartworld.com/favicon.png",
    },
  },
};

export default async function RootLayout({ children }) {
  const theme = await readThemeFromRequestCookies();

  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme={theme}
      className="theme-pending"
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CRITICAL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <title>HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول</title>
        <meta
          name="description"
          content="HasaN CharT World منصة احترافية لمتابعة أسواق المال، تشمل تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، تنبيهات سعرية، أخبار اقتصادية، وطلبات تحليل العملات."
        />
        <meta
          name="keywords"
          content="HasaN CharT World, حسن شارت, تحليل بيتكوين, تحليل العملات الرقمية, توصيات كريبتو, توصيات فوركس, توصيات Spot, توصيات Futures, أخبار اقتصادية, تنبيهات سعرية, إدارة حسابات التداول"
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.hasanchartworld.com" />
        <meta name="application-name" content="HasaN CharT World" />
        <meta name="apple-mobile-web-app-title" content="HasaN CharT World" />
        <meta name="name" content="HasaN CharT World" />
        <meta itemProp="name" content="HasaN CharT World" />
        <meta name="theme-color" content="#020617" />
        <link rel="icon" type="image/png" sizes="1024x1024" href="/favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="1024x1024" href="/favicon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ar_AR" />
        <meta property="og:url" content="https://www.hasanchartworld.com" />
        <meta property="og:site_name" content="HasaN CharT World" />
        <meta property="og:title" content="HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول" />
        <meta property="og:determiner" content="" />
        <meta
          property="og:description"
          content="منصة HasaN CharT World تقدم تحليلات للأسواق المالية، توصيات Spot و Futures، أخبار اقتصادية، تنبيهات سعرية، وخدمات احترافية للمتداولين."
        />
        <meta property="og:image" content="https://www.hasanchartworld.com/favicon.png" />
        <meta property="og:image:secure_url" content="https://www.hasanchartworld.com/favicon.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="HasaN CharT World Logo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول" />
        <meta
          name="twitter:description"
          content="تابع تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، الأخبار الاقتصادية، والتنبيهات السعرية عبر منصة HasaN CharT World."
        />
        <meta name="twitter:image" content="https://www.hasanchartworld.com/favicon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
          <AppProviders initialTheme={theme}>
            <RootLayoutShell>{children}</RootLayoutShell>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}

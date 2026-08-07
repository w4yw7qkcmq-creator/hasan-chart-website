/** @type {import('next').NextConfig} */
const { getSecurityHeaders } = require("./lib/security-headers");

const CACHE_PUBLIC_SEO_ARTIFACT =
  "public, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_PUBLIC_NEWS_PAGE =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

const nextConfig = {
  compress: true,
  poweredByHeader: false,
  experimental: {
    instrumentationHook: true,
    optimizePackageImports: [
      "@supabase/supabase-js",
      "@tanstack/react-virtual",
      "react-qr-code",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "ws"];
    }
    return config;
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 120,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.hasanchartworld.com",
      },
      {
        protocol: "https",
        hostname: "hasanchartworld.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/favicon.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon-:size.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_SEO_ARTIFACT,
          },
        ],
      },
      {
        source: "/news-sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_SEO_ARTIFACT,
          },
        ],
      },
      {
        source: "/content-sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_SEO_ARTIFACT,
          },
        ],
      },
      {
        source: "/news",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_NEWS_PAGE,
          },
        ],
      },
      {
        source: "/news/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_NEWS_PAGE,
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_PUBLIC_SEO_ARTIFACT,
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: '/(.*)',
        headers: getSecurityHeaders(),
      },
    ];
  },
};

module.exports = nextConfig;
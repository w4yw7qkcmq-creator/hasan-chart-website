const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";
export const EMAIL_LOGO_PATH = "/favicon.png";

export function getEmailLogoUrl(siteUrl) {
  const base = String(siteUrl || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(
    /\/$/,
    ""
  );

  return `${base}${EMAIL_LOGO_PATH}`;
}

export function buildEmailLogoHtml(siteUrl) {
  const logoUrl = getEmailLogoUrl(siteUrl);

  return `<img src="${logoUrl}" alt="HasaN CharT World" width="64" height="64" style="display:block;border-radius:16px;margin:0 auto 16px;" />`;
}

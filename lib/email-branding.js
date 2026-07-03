const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";
export const EMAIL_LOGO_PATH = "/favicon.png";
export const EMAIL_SITE_NAME = "HasaN CharT World";
export const EMAIL_LOGO_ALT = "شعار HasaN CharT World";

export function getEmailLogoUrl(siteUrl) {
  const base = String(siteUrl || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(
    /\/$/,
    ""
  );

  return `${base}${EMAIL_LOGO_PATH}`;
}

export function buildEmailLogoHtml(siteUrl) {
  const logoUrl = getEmailLogoUrl(siteUrl);

  return `<img src="${logoUrl}" alt="${EMAIL_LOGO_ALT}" title="${EMAIL_SITE_NAME}" width="64" height="64" style="display:block;border:0;border-radius:16px;margin:0 auto 16px;max-width:64px;height:auto;" />`;
}

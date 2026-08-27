/** Precomputed SHA-256 hashes for static theme boot scripts (edge-runtime safe). */
export const CSP_THEME_COOKIE_BOOT_HASH =
  "'sha256-cAoZdYshbXf78CsPt0oslJpmOc/y+xDSOt8qikK0pPw='";

export const CSP_STATIC_INLINE_SCRIPT_HASHES = [CSP_THEME_COOKIE_BOOT_HASH];

export function getStaticInlineScriptHashSources() {
  return [...CSP_STATIC_INLINE_SCRIPT_HASHES];
}

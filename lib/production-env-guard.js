/**
 * Guard helpers for Production-only Supabase operations.
 */

export const PRODUCTION_SUPABASE_PROJECT_REF = "lzgsxdsumnteuwtjfqlm";
export const STAGING_SUPABASE_PROJECT_REF = "tvkhuijufhnpqpchkyss";

export function maskProjectRef(ref = "") {
  const value = String(ref || "").trim();
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function extractSupabaseProjectRef(url = "") {
  const match = String(url || "").trim().match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || "";
}

export function assertProductionSupabaseConfig(config = {}) {
  const projectRef = String(config.projectRef || "").trim();
  const url = String(config.url || "").trim();
  const urlRef = extractSupabaseProjectRef(url);

  if (projectRef && projectRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Expected Production ref (${maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF)}), got ${maskProjectRef(projectRef)}`
    );
    error.code = "NOT_PRODUCTION_REF";
    throw error;
  }

  if (urlRef && urlRef === STAGING_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Supabase URL matches Staging (${maskProjectRef(urlRef)}). Aborting.`
    );
    error.code = "STAGING_REF_REJECTED";
    throw error;
  }

  if (urlRef && urlRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Supabase URL ref ${maskProjectRef(urlRef)} is not Production. Aborting.`
    );
    error.code = "UNKNOWN_SUPABASE_REF";
    throw error;
  }

  return { projectRef: projectRef || urlRef, url };
}

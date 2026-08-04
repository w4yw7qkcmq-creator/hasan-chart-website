/**
 * Guard helpers for Staging-only Supabase operations.
 * Rejects any staging config that points at Production project ref.
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

export function assertStagingSupabaseConfig(config = {}) {
  const projectRef = String(config.projectRef || "").trim();
  const url = String(config.url || "").trim();
  const urlRef = extractSupabaseProjectRef(url);

  if (!projectRef) {
    const error = new Error("Missing STAGING_SUPABASE_PROJECT_REF");
    error.code = "STAGING_CONFIG_MISSING";
    throw error;
  }

  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Staging project ref matches Production (${maskProjectRef(projectRef)}). Aborting.`
    );
    error.code = "STAGING_MATCHES_PRODUCTION_REF";
    throw error;
  }

  if (urlRef && urlRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Staging Supabase URL matches Production (${maskProjectRef(urlRef)}). Aborting.`
    );
    error.code = "STAGING_MATCHES_PRODUCTION_URL";
    throw error;
  }

  if (urlRef && projectRef && urlRef !== projectRef) {
    const error = new Error("STAGING_SUPABASE_URL project ref does not match STAGING_SUPABASE_PROJECT_REF");
    error.code = "STAGING_CONFIG_MISMATCH";
    throw error;
  }

  return {
    projectRef,
    url: url || `https://${projectRef}.supabase.co`,
    maskedProjectRef: maskProjectRef(projectRef),
  };
}

export function loadStagingEnvFromProcess(env = process.env) {
  return assertStagingSupabaseConfig({
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    url: env.STAGING_SUPABASE_URL,
  });
}

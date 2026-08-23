import { readJwtRole } from "./auth-session-jwt.js";

export function assertServiceRoleKeyFromEnv() {
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  if (
    (anonKey && serviceRoleKey === anonKey) ||
    serviceRoleKey.startsWith("sb_publishable_")
  ) {
    throw new Error("Invalid Supabase service role key");
  }

  const jwtRole = readJwtRole(serviceRoleKey);
  if (jwtRole && jwtRole !== "service_role") {
    throw new Error(`Invalid Supabase service role key (role=${jwtRole})`);
  }

  return serviceRoleKey;
}

#!/usr/bin/env node
/**
 * One-time provisioning for permanent E2E accounts.
 * Does NOT run automatically — execute manually once:
 *   npm run e2e:provision
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local and passwords in .env.e2e.local
 */
import { createClient } from "@supabase/supabase-js";
import { loadE2eEnv } from "./env.mjs";
import {
  E2E_ADMIN_EMAIL_SUGGESTED,
  E2E_ADMIN_METADATA,
  E2E_ADMIN_USERNAME,
  E2E_USER_EMAIL_SUGGESTED,
  E2E_USER_METADATA,
  E2E_USER_USERNAME,
} from "./constants.mjs";

const env = loadE2eEnv();

if (!env.hasSupabaseAdmin) {
  console.error("Missing Supabase admin env (.env.local). Cannot provision.");
  process.exit(1);
}

const userEmail = env.userEmail || E2E_USER_EMAIL_SUGGESTED;
const adminEmail = env.adminEmail || E2E_ADMIN_EMAIL_SUGGESTED;

if (!env.userPass || !env.adminPass) {
  console.error("Set E2E_USER_PASS and E2E_ADMIN_PASS in .env.e2e.local before provisioning.");
  process.exit(1);
}

const sb = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureAccount({ email, password, username, role, metadata }) {
  const { data: list, error: listError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { ...metadata, username },
    });
    if (created.error) throw created.error;
    user = created.data.user;
    console.log(`Created ${role}: ${email} (${user.id})`);
  } else {
    await sb.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata || {}), ...metadata, username },
    });
    console.log(`Updated ${role}: ${email} (${user.id})`);
  }

  const { error: profileError } = await sb.from("profiles").upsert({
    id: user.id,
    email,
    username,
    role,
  });
  if (profileError) throw profileError;

  return user.id;
}

(async () => {
  console.log("\n=== E2E Account Provisioning (one-time) ===\n");
  const userId = await ensureAccount({
    email: userEmail,
    password: env.userPass,
    username: E2E_USER_USERNAME,
    role: "user",
    metadata: E2E_USER_METADATA,
  });
  const adminId = await ensureAccount({
    email: adminEmail,
    password: env.adminPass,
    username: E2E_ADMIN_USERNAME,
    role: "admin",
    metadata: E2E_ADMIN_METADATA,
  });

  console.log("\nProvisioned IDs:");
  console.log(`  smoke-e2e-user:  ${userId}`);
  console.log(`  smoke-e2e-admin: ${adminId}`);
  console.log("\nAdd to .env.e2e.local (no commit):");
  console.log(`E2E_USER_EMAIL=${userEmail}`);
  console.log(`E2E_ADMIN_EMAIL=${adminEmail}`);
  console.log("\nDone. Run smoke test with: npm run smoke\n");
})().catch((error) => {
  console.error("Provision failed:", error?.message || error);
  process.exit(1);
});

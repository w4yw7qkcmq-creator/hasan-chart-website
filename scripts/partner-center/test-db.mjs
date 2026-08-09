#!/usr/bin/env node
/**
 * Apply partner-center test migrations to PGlite (local embedded PostgreSQL).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const PARTNER_MIGRATION_PREFIXES = [
  "20260705_partner",
  "20260706_partner",
  "20260708_partner",
  "20260709_partner",
  "20260710_partner",
  "20260711_partner",
  "20260715_partner",
  "20260810_partner_center",
  "20260811_partner_center",
  "20260812_partner_center",
  "20260813_partner_center",
  "20260814_partner_center",
];

function listPartnerMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => PARTNER_MIGRATION_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .sort();
}

export async function createPartnerTestDb() {
  const db = new PGlite();
  const bootstrap = readFileSync(join(__dirname, "test-db-bootstrap.sql"), "utf8");
  await db.exec(bootstrap);

  for (const file of listPartnerMigrations()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration failed: ${file}: ${error.message}`);
    }
  }

  return db;
}

export async function query(db, text, params = []) {
  return db.query(text, params);
}

export async function asRole(db, { userId, role = "authenticated" }, fn) {
  await db.exec(`SET request.jwt.claim.sub = '${userId}'`);
  await db.exec(`SET request.jwt.claim.role = '${role}'`);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.exec("RESET request.jwt.claim.sub");
    await db.exec("RESET request.jwt.claim.role");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await createPartnerTestDb();
  const tables = await db.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'partner%'
    ORDER BY tablename
  `);
  console.log("Partner Center test DB ready.");
  console.log("Tables:", tables.rows.map((r) => r.tablename).join(", "));
  await db.close();
}

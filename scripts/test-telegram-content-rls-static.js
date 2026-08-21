#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821160000_telegram_content_layer.sql"),
  "utf8"
);

assert.match(migration, /telegram_content_posts_public_read/);
assert.match(migration, /telegram_content_images_public_read/);
assert.match(migration, /telegram_content_staging_service_role_all/);
assert.match(migration, /telegram_content_images_public_read ON storage\.objects/);
assert.match(migration, /enforce_telegram_section_retention/);
assert.match(migration, /cleanup_telegram_content_operational_tables/);
assert.match(migration, /telegram_webhook_ingress_log_update_id_unique_idx/);
assert.match(migration, /telegram_content_posts_single_msg_unique_idx/);
assert.match(migration, /telegram_content_posts_album_unique_idx/);
assert.doesNotMatch(migration, /ALTER TABLE public\.daily_analysis/);
assert.doesNotMatch(migration, /ALTER TABLE public\.content_posts/);

console.log("test-telegram-content-rls-static: PASS");

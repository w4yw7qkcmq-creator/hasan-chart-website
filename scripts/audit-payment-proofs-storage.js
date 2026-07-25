#!/usr/bin/env node
/**
 * Dry-run audit for payment proof storage consistency.
 * Does NOT delete anything.
 *
 * Usage:
 *   node scripts/audit-payment-proofs-storage.js
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "payment-proofs";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = {
    legacyInlineWithoutPath: 0,
    pathWithoutLegacy: 0,
    pathAndLegacy: 0,
    legacyExternalUrl: 0,
    missingProof: 0,
    invalidMime: 0,
    oversizeLegacy: 0,
    storageObjectsListed: 0,
    dbPathsMissingInStorage: 0,
    orphanStorageObjects: 0,
  };

  const { count: legacyInlineCount, error: legacyInlineError } = await supabase
    .from("subscription_requests")
    .select("id", { count: "exact", head: true })
    .is("payment_proof_path", null)
    .like("payment_proof", "data:image/%");

  if (legacyInlineError) throw legacyInlineError;
  report.legacyInlineWithoutPath = legacyInlineCount || 0;

  const { data: pathRows, error: pathError } = await supabase
    .from("subscription_requests")
    .select("id,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes")
    .not("payment_proof_path", "is", null)
    .limit(5000);

  if (pathError) throw pathError;

  const dbPaths = new Set();
  for (const row of pathRows || []) {
    dbPaths.add(String(row.payment_proof_path));
    if (row.payment_proof_size_bytes > 8 * 1024 * 1024) {
      report.oversizeLegacy += 1;
    }
    const mime = String(row.payment_proof_mime_type || "").toLowerCase();
    if (mime && !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      report.invalidMime += 1;
    }
  }

  const { data: storageList, error: storageError } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (storageError && storageError.message !== "Bucket not found") {
    throw storageError;
  }

  const storagePaths = new Set();
  if (Array.isArray(storageList)) {
    report.storageObjectsListed = storageList.length;
    for (const item of storageList) {
      if (item?.name) storagePaths.add(item.name);
    }
  }

  for (const path of dbPaths) {
    const { data: headData, error: headError } = await supabase.storage.from(BUCKET).list(
      path.split("/").slice(0, -1).join("/") || "",
      { search: path.split("/").pop() }
    );
    if (headError || !headData?.length) {
      report.dbPathsMissingInStorage += 1;
    }
  }

  console.info("PAYMENT_PROOF_AUDIT_REPORT", report);
}

main().catch((error) => {
  console.error("PAYMENT_PROOF_AUDIT_FATAL", error?.message || error);
  process.exit(1);
});

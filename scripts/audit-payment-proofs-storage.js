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
import {
  PAYMENT_PROOF_BUCKET,
  extractImageDimensions,
  hashPaymentProofContent,
  listPaymentProofStorageObjectPaths,
  validatePaymentProofFileBuffer,
} from "../lib/payment-proof-storage.js";
import { decodeInlinePaymentProof } from "../lib/admin-payment-proof-response.js";

function buildDuplicateGroups(entries, keySelector) {
  const map = new Map();
  for (const entry of entries) {
    const key = keySelector(entry);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  }
  return [...map.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, items }));
}

async function inspectStorageObject(supabase, objectPath) {
  const { data, error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).download(objectPath);
  if (error) {
    return {
      objectPath,
      downloadError: error.message || String(error),
      exists: false,
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const validation = validatePaymentProofFileBuffer(buffer);
  const dimensions = extractImageDimensions(buffer);
  return {
    objectPath,
    exists: true,
    bytes: buffer.length,
    zeroBytes: buffer.length === 0,
    contentHash: hashPaymentProofContent(buffer),
    validationOk: validation.ok,
    validationCode: validation.code || null,
    width: dimensions?.width ?? validation.width ?? null,
    height: dimensions?.height ?? validation.height ?? null,
    mime: validation.mime || dimensions?.mime || null,
    isInvalidPlaceholder: validation.code === "INVALID_PLACEHOLDER_IMAGE",
  };
}

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

  const { data: pathRows, error: pathError } = await supabase
    .from("subscription_requests")
    .select("id,payment_proof_path,payment_proof_mime_type,payment_proof_size_bytes,payment_proof")
    .not("payment_proof_path", "is", null)
    .limit(5000);

  if (pathError) throw pathError;

  const dbPathToRequestIds = new Map();
  for (const row of pathRows || []) {
    const objectPath = String(row.payment_proof_path || "").trim();
    if (!objectPath) continue;
    const ids = dbPathToRequestIds.get(objectPath) || [];
    ids.push(Number(row.id));
    dbPathToRequestIds.set(objectPath, ids);
  }

  const dbPaths = [...dbPathToRequestIds.keys()];
  const storageObjectPaths = await listPaymentProofStorageObjectPaths(supabase);
  const storagePathSet = new Set(storageObjectPaths);

  const dbPathInspections = [];
  for (const objectPath of dbPaths) {
    dbPathInspections.push(await inspectStorageObject(supabase, objectPath));
  }

  const dbPathsMissingInStorage = dbPathInspections
    .filter((item) => !item.exists)
    .map((item) => item.objectPath);

  const orphanObjectPaths = storageObjectPaths.filter((objectPath) => !dbPathToRequestIds.has(objectPath));

  const orphanInspections = [];
  for (const objectPath of orphanObjectPaths) {
    orphanInspections.push(await inspectStorageObject(supabase, objectPath));
  }

  const allStorageInspections = [
    ...dbPathInspections.filter((item) => item.exists),
    ...orphanInspections.filter((item) => item.exists),
  ];

  const duplicateObjectPaths = buildDuplicateGroups(
    storageObjectPaths.map((objectPath) => ({ objectPath })),
    (item) => item.objectPath
  );

  const duplicateContentGroups = buildDuplicateGroups(allStorageInspections, (item) => item.contentHash).map(
    (group) => ({
      contentHash: group.key,
      objectPaths: group.items.map((item) => item.objectPath),
      requestIds: group.items.flatMap((item) => dbPathToRequestIds.get(item.objectPath) || []),
    })
  );

  const linkedInvalidPlaceholderObjects = dbPathInspections
    .filter((item) => item.exists && item.isInvalidPlaceholder)
    .map((item) => ({
      classification: "invalid-placeholder-object",
      linkedToDb: true,
      requestIds: dbPathToRequestIds.get(item.objectPath) || [],
      objectPath: item.objectPath,
      bytes: item.bytes,
      dimensions: `${item.width}×${item.height}`,
      contentHash: item.contentHash,
      validationCode: item.validationCode,
    }));

  const invalidPlaceholderGroup =
    linkedInvalidPlaceholderObjects.length > 0
      ? {
          classification: "invalid-placeholder-object",
          linkedToDb: true,
          requestIds: linkedInvalidPlaceholderObjects.flatMap((item) => item.requestIds),
          objectPaths: linkedInvalidPlaceholderObjects.map((item) => item.objectPath),
          dimensions: linkedInvalidPlaceholderObjects[0]?.dimensions || null,
          contentHash: linkedInvalidPlaceholderObjects[0]?.contentHash || null,
        }
      : null;

  const { data: legacyInlineRows, error: legacyError } = await supabase
    .from("subscription_requests")
    .select("id,payment_proof,payment_proof_path")
    .is("payment_proof_path", null)
    .like("payment_proof", "data:image/%")
    .limit(5000);

  if (legacyError) throw legacyError;

  const legacyInlineAudit = [];
  for (const row of legacyInlineRows || []) {
    let validation = { ok: false, code: "MISSING_INLINE" };
    try {
      const decoded = decodeInlinePaymentProof(String(row.payment_proof || ""));
      validation = validatePaymentProofFileBuffer(decoded.buffer, { declaredMime: decoded.mimeType });
    } catch {
      validation = { ok: false, code: "DECODE_FAILED" };
    }
    legacyInlineAudit.push({
      requestId: row.id,
      validationOk: validation.ok,
      validationCode: validation.code || null,
      width: validation.width ?? null,
      height: validation.height ?? null,
      isInvalidPlaceholder: validation.code === "INVALID_PLACEHOLDER_IMAGE",
    });
  }

  const report = {
    storageObjectsListed: storageObjectPaths.length,
    dbPathsCount: dbPaths.length,
    dbPathsMissingInStorage: dbPathsMissingInStorage.length,
    dbPathsMissingInStorageList: dbPathsMissingInStorage,
    orphanStorageObjects: orphanObjectPaths.length,
    orphanObjectPaths,
    zeroByteObjects: allStorageInspections.filter((item) => item.zeroBytes).map((item) => item.objectPath),
    duplicateObjectPaths,
    duplicateContentGroups,
    objectsWithInvalidMime: allStorageInspections
      .filter((item) => item.validationCode === "INVALID_UPLOAD_MIME")
      .map((item) => item.objectPath),
    objectsWithInvalidDimensions: allStorageInspections
      .filter((item) =>
        ["INVALID_PLACEHOLDER_IMAGE", "INVALID_IMAGE_DIMENSIONS"].includes(item.validationCode)
      )
      .map((item) => ({
        objectPath: item.objectPath,
        validationCode: item.validationCode,
        dimensions: `${item.width}×${item.height}`,
      })),
    linkedInvalidPlaceholderObjects,
    invalidPlaceholderGroup,
    legacyInlineWithoutPath: legacyInlineRows?.length || 0,
    legacyInlineAudit,
    cleanupPlan: [
      "1. Resolve request status for invalid-placeholder rows (41–45): keep legacy Base64 read or mark requests reviewed/archived.",
      "2. nullify or clear payment_proof_path in DB only after deciding the request no longer needs Storage preview.",
      "3. Delete Storage objects only when no DB row, upload session, or audit reference points to the object path.",
      "4. Verify signed read + admin preview for all remaining real proofs.",
      "5. Run audit-payment-proofs-storage.js again and confirm orphanStorageObjects=0 and linkedInvalidPlaceholderObjects=0.",
    ],
  };

  console.info("PAYMENT_PROOF_AUDIT_REPORT", report);
}

main().catch((error) => {
  console.error("PAYMENT_PROOF_AUDIT_FATAL", error?.message || error);
  process.exit(1);
});

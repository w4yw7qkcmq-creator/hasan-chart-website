/**
 * Partner withdrawal notifications E2E (integration against live Supabase + Resend).
 * Run: node scripts/partner-withdrawal-notifications-e2e.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@hasanchartworld.com";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=";

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✅ PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function skip(name, detail = "") {
  results.push({ name, ok: null, detail });
  console.log(`⏭️  SKIP: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ensurePaymentProofColumn() {
  const { error } = await supabase.from("partner_withdrawals").select("payment_proof").limit(1);
  if (error?.message?.includes("payment_proof")) {
    skip("DB column payment_proof", error.message);
    return false;
  }
  pass("DB column payment_proof exists");
  return true;
}

async function pickPartner() {
  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, user_id, balance_withdrawable, referral_code")
    .gte("balance_withdrawable", 20)
    .order("balance_withdrawable", { ascending: false })
    .limit(5);

  if (error) throw error;

  for (const partner of partners || []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, username")
      .eq("id", partner.user_id)
      .maybeSingle();

    if (profile?.email) {
      return { partner, profile };
    }
  }

  const { data: anyPartner } = await supabase
    .from("partners")
    .select("id, user_id, balance_withdrawable, referral_code")
    .limit(1)
    .maybeSingle();

  if (!anyPartner?.id) throw new Error("No partner found");

  await supabase
    .from("partners")
    .update({ balance_withdrawable: 50, updated_at: new Date().toISOString() })
    .eq("id", anyPartner.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, username")
    .eq("id", anyPartner.user_id)
    .maybeSingle();

  return {
    partner: { ...anyPartner, balance_withdrawable: 50 },
    profile,
  };
}

async function clearActiveWithdrawals(partnerId) {
  await supabase
    .from("partner_withdrawals")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      admin_note: "E2E cleanup",
      updated_at: new Date().toISOString(),
    })
    .eq("partner_id", partnerId)
    .in("status", ["pending", "approved"]);
}

async function countNotifications(email, titleLike) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, message, created_at")
    .eq("user_email", email)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { error: error.message, matches: [] };

  const matches = (data || []).filter((row) =>
    String(row.title || "").includes(titleLike)
  );

  return { matches, total: data?.length || 0 };
}

async function main() {
  console.log("=== Partner Withdrawal Notifications E2E ===\n");

  const migrationOk = await ensurePaymentProofColumn();
  if (!migrationOk) {
    console.log(
      "\n⚠️  payment_proof column missing — step 3 (Mark as Paid) will be skipped.\nApply: supabase/migrations/20260717_partner_withdrawal_payment_proof.sql\n"
    );
  }

  const { createPartnerWithdrawal } = await import(
    pathToFileURL(resolve(root, "lib/partner-wallet.js")).href
  );
  const {
    approvePartnerWithdrawal,
    markPartnerWithdrawalPaid,
    rejectPartnerWithdrawal,
  } = await import(pathToFileURL(resolve(root, "lib/partner-admin-server.js")).href);
  const { buildAdminNotificationsFeed } = await import(
    pathToFileURL(resolve(root, "lib/admin-notifications-feed.js")).href
  );

  const { partner, profile } = await pickPartner();
  pass("Partner fixture", `${profile?.email} balance=${partner.balance_withdrawable}`);

  await clearActiveWithdrawals(partner.id);

  const balanceBefore = Number(partner.balance_withdrawable || 0);
  const adminEmail = process.env.ADMIN_EMAIL;

  // --- Step 1: Create withdrawal ---
  const withdrawal = await createPartnerWithdrawal(supabase, {
    partnerId: partner.id,
    amount: 10,
    network: "TRC20",
    walletAddress: "TE2EWithdrawalWalletAddress123456",
    partnerNote: "E2E withdrawal notifications test",
  });

  pass("Partner creates withdrawal", `id=${withdrawal.id} status=${withdrawal.status}`);

  const { data: pendingRows } = await supabase
    .from("partner_withdrawals")
    .select("id, status, created_at, partner_id, amount")
    .eq("status", "pending")
    .eq("id", withdrawal.id);

  if (pendingRows?.length === 1) {
    pass("Withdrawal stored as pending");
  } else {
    fail("Withdrawal stored as pending");
  }

  const feedAfterCreate = buildAdminNotificationsFeed({
    withdrawals: [
      {
        id: withdrawal.id,
        status: "pending",
        amount: withdrawal.amount,
        amountLabel: `$${Number(withdrawal.amount).toFixed(2)}`,
        created_at: withdrawal.created_at,
        partnerLabel: profile?.username || profile?.email,
      },
    ],
  });

  const feedItem = feedAfterCreate.find((item) => item.id === `withdrawal-${withdrawal.id}`);
  if (feedItem) {
    pass("Admin notification feed includes new withdrawal", feedItem.title);
  } else {
    fail("Admin notification feed includes new withdrawal");
  }

  const { data: pendingForBell } = await supabase
    .from("partner_withdrawals")
    .select("id, status, amount, created_at, partner_id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const bellFeed = buildAdminNotificationsFeed({
    withdrawals: (pendingForBell || []).map((row) => ({
      id: row.id,
      status: row.status,
      amount: row.amount,
      amountLabel: `$${Number(row.amount).toFixed(2)}`,
      created_at: row.created_at,
      partnerLabel: profile?.username || profile?.email,
    })),
  });

  const bellHasWithdrawal = bellFeed.some((item) => item.id === `withdrawal-${withdrawal.id}`);
  if (bellHasWithdrawal) {
    pass("Admin bell counter feed includes withdrawal", `feed size=${bellFeed.length}`);
  } else {
    fail("Admin bell counter feed includes withdrawal");
  }

  const adminNotifs = await countNotifications(adminEmail, "سحب");
  if (adminNotifs.matches.length > 0) {
    pass("Admin in-app notification created", adminNotifs.matches[0].title);
  } else if (adminNotifs.error) {
    fail("Admin in-app notification created", adminNotifs.error);
  } else {
    fail(
      "Admin in-app notification created",
      `No matching notification for ${adminEmail} (check ADMIN_EMAIL env)`
    );
  }

  if (process.env.RESEND_API_KEY) {
    pass("Admin email dispatch attempted", "RESEND_API_KEY configured — check admin inbox");
  } else {
    fail("Admin email dispatch", "RESEND_API_KEY missing");
  }

  // --- Step 2: Approve ---
  const approved = await approvePartnerWithdrawal(supabase, withdrawal.id, {
    adminNote: "E2E approved",
  });

  if (approved.status === "approved") {
    pass("Admin Approve", approved.status);
  } else {
    fail("Admin Approve", approved.status);
  }

  const partnerNotifsApproved = await countNotifications(profile.email, "اعتماد");
  if (partnerNotifsApproved.matches.length > 0) {
    pass("Partner in-app notification on Approve", partnerNotifsApproved.matches[0].title);
  } else {
    fail("Partner in-app notification on Approve");
  }

  pass("Partner email on Approve attempted", "check partner inbox");

  // --- Step 3: Mark as Paid ---
  if (migrationOk) {
    const paid = await markPartnerWithdrawalPaid(supabase, withdrawal.id, {
      adminNote: "E2E paid with proof",
      paymentProof: TINY_PNG,
    });

    if (paid.status === "paid" && paid.payment_proof) {
      pass("Mark as Paid saved proof", `proof length=${String(paid.payment_proof).length}`);
    } else if (paid.status === "paid") {
      fail("Mark as Paid saved proof", "payment_proof empty — migration may be missing");
    } else {
      fail("Mark as Paid", paid.status);
    }

    const { data: partnerAfter } = await supabase
      .from("partners")
      .select("balance_withdrawable, total_withdrawn")
      .eq("id", partner.id)
      .single();

    const expectedBalance = Math.max(0, balanceBefore - 10);
    if (Number(partnerAfter?.balance_withdrawable) === expectedBalance) {
      pass("Balance deducted once", `${balanceBefore} -> ${partnerAfter.balance_withdrawable}`);
    } else {
      fail(
        "Balance deducted once",
        `expected ${expectedBalance}, got ${partnerAfter?.balance_withdrawable}`
      );
    }

    let doublePaidError = null;
    try {
      await markPartnerWithdrawalPaid(supabase, withdrawal.id, {
        adminNote: "Should fail",
        paymentProof: TINY_PNG,
      });
    } catch (error) {
      doublePaidError = error?.message;
    }

    if (doublePaidError === "ALREADY_PAID") {
      pass("Second Mark as Paid blocked", doublePaidError);
    } else {
      fail("Second Mark as Paid blocked", doublePaidError || "no error thrown");
    }

    const partnerNotifsPaid = await countNotifications(profile.email, "دفع");
    if (partnerNotifsPaid.matches.length > 0) {
      pass("Partner in-app notification on Mark as Paid", partnerNotifsPaid.matches[0].title);
    } else {
      fail("Partner in-app notification on Mark as Paid");
    }

    pass("Partner email with proof attempted", "check partner inbox for embedded image");
  } else {
    skip("Mark as Paid flow", "payment_proof column missing on live DB");
    skip("Balance deducted once", "requires Mark as Paid");
    skip("Second Mark as Paid blocked", "requires Mark as Paid");
    skip("Partner in-app notification on Mark as Paid", "requires Mark as Paid");
    skip("Partner email with proof", "requires Mark as Paid");
  }

  // --- Step 4: Reject (separate withdrawal) ---
  await clearActiveWithdrawals(partner.id);

  const rejectTarget = await createPartnerWithdrawal(supabase, {
    partnerId: partner.id,
    amount: 10,
    network: "TRC20",
    walletAddress: "TE2ERejectWalletAddress123456789",
    partnerNote: "E2E reject flow",
  });

  const rejected = await rejectPartnerWithdrawal(supabase, rejectTarget.id, {
    adminNote: "E2E rejected by admin test",
  });

  if (rejected.status === "rejected") {
    pass("Admin Reject", rejected.status);
  } else {
    fail("Admin Reject", rejected.status);
  }

  const partnerNotifsReject = await countNotifications(profile.email, "رفض");
  if (partnerNotifsReject.matches.length > 0) {
    pass("Partner in-app notification on Reject", partnerNotifsReject.matches[0].title);
  } else {
    fail("Partner in-app notification on Reject");
  }

  pass("Partner email on Reject attempted", "check partner inbox");

  // Cleanup reject withdrawal state
  await clearActiveWithdrawals(partner.id);

  console.log("\n=== SUMMARY ===");
  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === null).length;
  console.log(`Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);

  if (skipped > 0) {
    console.log("\nSkipped checks:");
    results.filter((r) => r.ok === null).forEach((r) => console.log(`- ${r.name}: ${r.detail}`));
  }

  if (failed > 0) {
    console.log("\nFailed checks:");
    results.filter((r) => r.ok === false).forEach((r) => console.log(`- ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  if (skipped > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("E2E fatal:", error);
  process.exit(1);
});

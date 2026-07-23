import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  __resetSubscriptionRejectLocksForTests,
  rejectSubscriptionRequest,
} from "../lib/admin-subscription-request-reject.js";
import {
  assertAdminSubscriptionRejectAuthorized,
  canRejectSubscriptionRequest,
  normalizeSubscriptionRequestId,
  requireValidSubscriptionRequestId,
  validateSubscriptionRejectPayload,
} from "../lib/admin-subscription-request-reject-shared.js";
import {
  buildSubscriptionRejectedIdempotencyKey,
  buildSubscriptionResubmitUrl,
  dispatchSubscriptionRejectedEmail,
  SUBSCRIPTION_REJECTED_SUPPORT_URL,
  SUBSCRIPTION_RESUBMIT_PATH,
} from "../lib/subscription-rejected-dispatch.js";
import { buildEmailLayout, getSiteUrl } from "../lib/email.js";
import { buildSubscriptionRejectedEmailContent } from "../lib/email-layout.js";
import {
  enrichSubscriptionRequestsWithRejectionDetails,
  formatSubscriptionRejectionDetailsForAdmin,
  mapSubscriptionRejectionDetailsFromAuditLog,
} from "../lib/admin-subscription-rejection-details.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "admin@hasanchartworld.com",
};
const USER_EMAIL = "user@example.com";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PAYMENT_PROOF = "https://cdn.example.com/payment-proof.jpg";

function createMockSupabase(initialRow, options = {}) {
  let row = initialRow ? { ...initialRow } : null;
  const auditRows = [];
  let storageRemoveCalled = false;
  const {
    updateFails = false,
    updateRace = false,
    profileLookup = { id: USER_ID },
    adminLogs = [],
  } = options;

  const supabase = {
    auditRows,
    storageRemoveCalled: () => storageRemoveCalled,
    from(table) {
      if (table === "subscription_requests") {
        return {
          select() {
            return {
              eq(_column, value) {
                return {
                  async maybeSingle() {
                    if (!row || String(value) !== String(row.id)) {
                      return { data: null, error: null };
                    }
                    return { data: { ...row }, error: null };
                  },
                };
              },
            };
          },
          update(nextValues) {
            assert.notEqual(
              Object.prototype.hasOwnProperty.call(nextValues, "payment_proof"),
              true,
              "reject update must not touch payment_proof"
            );

            return {
              eq(_column, value) {
                const chain = {
                  eq(_statusColumn, expectedStatus) {
                    chain._expectedStatus = expectedStatus;
                    return chain;
                  },
                  select() {
                    return chain;
                  },
                  async maybeSingle() {
                    if (!row || String(value) !== String(row.id)) {
                      return { data: null, error: null };
                    }

                    if (updateFails) {
                      return { data: null, error: { message: "update failed" } };
                    }

                    if (updateRace || row.status !== chain._expectedStatus) {
                      return { data: null, error: null };
                    }

                    row = { ...row, ...nextValues };
                    return { data: { id: row.id, status: row.status }, error: null };
                  },
                };

                return chain;
              },
            };
          },
        };
      }

      if (table === "profiles") {
        return {
          select() {
            return {
              eq(_column, value) {
                return {
                  async maybeSingle() {
                    if (value !== USER_EMAIL) {
                      return { data: null, error: null };
                    }
                    return { data: profileLookup, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "admin_logs") {
        return {
          insert(payload) {
            auditRows.push(payload);
            return Promise.resolve({ error: null });
          },
          select() {
            const chain = {
              eq(column, value) {
                chain._filters = [...(chain._filters || []), { column, value }];
                return chain;
              },
              in(column, values) {
                chain._filters = [...(chain._filters || []), { column, values }];
                return chain;
              },
              order() {
                return chain;
              },
              async then(resolve, reject) {
                try {
                  const filtered = (adminLogs || []).filter((log) => {
                    for (const filter of chain._filters || []) {
                      if (filter.column === "action" && log.action !== filter.value) {
                        return false;
                      }
                      if (
                        filter.column === "target_id" &&
                        !filter.values.includes(String(log.target_id))
                      ) {
                        return false;
                      }
                    }
                    return true;
                  });
                  resolve({ data: filtered, error: null });
                } catch (error) {
                  reject(error);
                }
              },
            };
            return chain;
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from() {
        return {
          remove() {
            storageRemoveCalled = true;
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    getRow() {
      return row;
    },
  };

  return supabase;
}

function createRejectSideEffectMocks(overrides = {}) {
  return {
    dispatchAlerts:
      overrides.dispatchAlerts ||
      (async () => ({ notificationCreated: true })),
    dispatchRejectedEmail:
      overrides.dispatchRejectedEmail ||
      (async () => ({ emailQueued: true, queued: true, enqueued: true })),
  };
}

async function testSuccessfulRejectWithNotificationAndEmail() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    username: "Hasan User",
    plan_name: "VIP Spot",
    price: "50 USDT",
    created_at: "2026-07-01T10:00:00.000Z",
    status: "قيد المعالجة",
  });

  let notificationCalled = false;
  let emailCalled = false;

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "صورة الدفع غير واضحة",
    rejectionNotes: "يرجى إعادة الإرسال",
    dispatchAlerts: async () => {
      notificationCalled = true;
      return { notificationCreated: true };
    },
    dispatchRejectedEmail: async (payload) => {
      emailCalled = true;
      assert.equal(payload.subscriptionRequestId, REQUEST_ID);
      assert.equal(payload.recipientEmail, USER_EMAIL);
      assert.equal(payload.planName, "VIP Spot");
      return { emailQueued: true, queued: true, enqueued: true };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.notificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.notificationWarning, null);
  assert.equal(result.emailWarning, null);
  assert.equal(notificationCalled, true);
  assert.equal(emailCalled, true);
  assert.equal(supabase.auditRows[0].details.emailQueued, true);
  assert.equal(supabase.auditRows[0].details.adminNotes, "يرجى إعادة الإرسال");
}

async function testEmptyReasonRejected() {
  assert.throws(
    () =>
      validateSubscriptionRejectPayload({
        rejectionReason: "   ",
        rejectionNotes: "",
      }),
    (error) => error.status === 400 && /سبب الرفض مطلوب/.test(error.message)
  );
}

async function testRequestNotFound() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase(null);
  let emailCalled = false;

  await assert.rejects(
    () =>
      rejectSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        rejectionReason: "صورة الدفع غير واضحة",
        ...createRejectSideEffectMocks({
          dispatchRejectedEmail: async () => {
            emailCalled = true;
            return { emailQueued: true };
          },
        }),
      }),
    (error) => error.status === 404 && /غير موجود/.test(error.message)
  );

  assert.equal(emailCalled, false);
}

async function testNonAdminAccessBlocked() {
  assert.throws(
    () =>
      assertAdminSubscriptionRejectAuthorized({
        ok: false,
        status: 403,
        error: "غير مصرح لك بالدخول",
      }),
    (error) => error.status === 403
  );
}

async function testAlreadyRejected() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "مرفوض",
  });

  let emailCalled = false;

  await assert.rejects(
    () =>
      rejectSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        rejectionReason: "صورة الدفع غير واضحة",
        ...createRejectSideEffectMocks({
          dispatchRejectedEmail: async () => {
            emailCalled = true;
            return { emailQueued: true };
          },
        }),
      }),
    (error) => error.status === 409 && /مرفوض|رفض/.test(error.message)
  );

  assert.equal(emailCalled, false);
}

async function testRejectSuccessWithNotificationFailure() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "المبلغ غير مطابق",
    dispatchAlerts: async () => {
      throw new Error("notification down");
    },
    dispatchRejectedEmail: async () => ({ emailQueued: true }),
  });

  assert.equal(result.success, true);
  assert.equal(result.notificationCreated, false);
  assert.equal(result.emailQueued, true);
  assert.match(result.notificationWarning, /تعذر إنشاء إشعار/);
  assert.equal(result.emailWarning, null);
}

async function testRejectSuccessWithEmailQueueFailure() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "إثبات الدفع غير صحيح",
    dispatchAlerts: async () => ({ notificationCreated: true }),
    dispatchRejectedEmail: async () => ({ emailQueued: false, error: "queue failed" }),
  });

  assert.equal(result.success, true);
  assert.equal(result.notificationCreated, true);
  assert.equal(result.emailQueued, false);
  assert.match(result.emailWarning, /تعذر إضافة رسالة البريد/);
}

async function testNoEmailWhenUpdateFails() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase(
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "VIP Spot",
      status: "قيد المعالجة",
    },
    { updateFails: true }
  );

  let emailCalled = false;
  let notificationCalled = false;

  await assert.rejects(
    () =>
      rejectSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        rejectionReason: "بيانات غير مكتملة",
        dispatchAlerts: async () => {
          notificationCalled = true;
          return { notificationCreated: true };
        },
        dispatchRejectedEmail: async () => {
          emailCalled = true;
          return { emailQueued: true };
        },
      }),
    /update failed/
  );

  assert.equal(emailCalled, false);
  assert.equal(notificationCalled, false);
}

async function testPreventDuplicateEmailDispatch() {
  const dispatchCalls = [];

  const first = await dispatchSubscriptionRejectedEmail(
    {
      subscriptionRequestId: REQUEST_ID,
      recipientEmail: USER_EMAIL,
      username: "Hasan",
      planName: "VIP Spot",
      price: "50 USDT",
      createdAt: "2026-07-01T10:00:00.000Z",
      rejectionReason: "صورة الدفع غير واضحة",
      adminNotes: "ملاحظة",
    },
    {
      dispatchTransactionalEmail: async (payload) => {
        dispatchCalls.push(payload.idempotencyKey);
        return {
          success: true,
          mode: "outbox",
          enqueued: dispatchCalls.length === 1,
          duplicate: dispatchCalls.length > 1,
          record: { id: "outbox-1" },
        };
      },
    }
  );

  const second = await dispatchSubscriptionRejectedEmail(
    {
      subscriptionRequestId: REQUEST_ID,
      recipientEmail: USER_EMAIL,
      username: "Hasan",
      planName: "VIP Spot",
      price: "50 USDT",
      createdAt: "2026-07-01T10:00:00.000Z",
      rejectionReason: "صورة الدفع غير واضحة",
      adminNotes: "ملاحظة",
    },
    {
      dispatchTransactionalEmail: async (payload) => {
        dispatchCalls.push(payload.idempotencyKey);
        return {
          success: true,
          mode: "outbox",
          enqueued: false,
          duplicate: true,
          record: { id: "outbox-1" },
        };
      },
    }
  );

  assert.equal(
    buildSubscriptionRejectedIdempotencyKey(REQUEST_ID),
    `subscription_rejected:${REQUEST_ID}`
  );
  assert.equal(first.emailQueued, true);
  assert.equal(second.emailQueued, true);
  assert.equal(second.duplicate, true);
  assert.equal(dispatchCalls.length, 2);
  assert.equal(dispatchCalls[0], dispatchCalls[1]);
}

async function testPaymentProofPreservedAfterReject() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    username: "Hasan User",
    plan_name: "VIP Spot",
    price: "50 USDT",
    created_at: "2026-07-01T10:00:00.000Z",
    status: "قيد المعالجة",
    payment_proof: PAYMENT_PROOF,
  });

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "صورة الدفع غير واضحة",
    ...createRejectSideEffectMocks(),
  });

  assert.equal(result.success, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "paymentProof"), false);
  assert.equal(supabase.getRow().payment_proof, PAYMENT_PROOF);
  assert.equal(supabase.getRow().status, "مرفوض");
  assert.equal(supabase.storageRemoveCalled(), false);
}

async function testRejectDoesNotDeleteStorageOrRecreateRequest() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
    payment_proof: PAYMENT_PROOF,
    created_at: "2026-07-01T10:00:00.000Z",
  });

  await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "المبلغ غير مطابق",
    ...createRejectSideEffectMocks(),
  });

  assert.equal(supabase.getRow().id, REQUEST_ID);
  assert.equal(supabase.getRow().status, "مرفوض");
  assert.equal(supabase.getRow().created_at, "2026-07-01T10:00:00.000Z");
  assert.equal(supabase.storageRemoveCalled(), false);
}

async function testRejectedEmailHasResubmitAndSupportButtons() {
  const resubmitUrl = buildSubscriptionResubmitUrl(getSiteUrl());
  const content = buildSubscriptionRejectedEmailContent({
    username: "Hasan User",
    planName: "VIP Spot",
    price: "50 USDT",
    createdAt: "2026-07-01T10:00:00.000Z",
    rejectionReason: "صورة الدفع غير واضحة",
    adminNotes: "يرجى إعادة الإرسال",
    requestId: REQUEST_ID,
  });

  const html = buildEmailLayout({
    title: "تم رفض طلب الاشتراك",
    content,
    actionText: "إعادة تقديم الطلب",
    actionUrl: resubmitUrl,
    secondaryActionText: "التواصل مع الدعم الفني",
    secondaryActionUrl: SUBSCRIPTION_REJECTED_SUPPORT_URL,
  });

  assert.match(html, /إعادة تقديم الطلب/);
  assert.match(html, /التواصل مع الدعم الفني/);
  assert.match(html, new RegExp(resubmitUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /https:\/\/t\.me\/HasaNCharTSupport/);
  assert.doesNotMatch(html, /payment_proof|proof\.jpg|requestId=/i);
}

async function testResubmitUrlUsesSiteUrl() {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://staging.hasanchartworld.com";

  try {
    const url = buildSubscriptionResubmitUrl(getSiteUrl());
    assert.equal(url, `https://staging.hasanchartworld.com${SUBSCRIPTION_RESUBMIT_PATH}`);
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }
}

async function testResubmitPathPointsToSubscriptionsForm() {
  assert.equal(SUBSCRIPTION_RESUBMIT_PATH, "/subscriptions#plans");
}

async function testRejectionDetailsFromAuditLog() {
  const mapped = mapSubscriptionRejectionDetailsFromAuditLog({
    admin_email: "admin@hasanchartworld.com",
    created_at: "2026-07-02T12:00:00.000Z",
    details: {
      rejectionReason: "صورة الدفع غير واضحة",
      adminNotes: "يرجى إعادة الإرسال",
      timestamp: "2026-07-02T12:05:00.000Z",
      adminEmail: "admin@hasanchartworld.com",
      notificationCreated: true,
      emailQueued: true,
    },
  });

  const formatted = formatSubscriptionRejectionDetailsForAdmin(mapped);
  assert.equal(formatted.rejectionReason, "صورة الدفع غير واضحة");
  assert.equal(formatted.adminNotes, "يرجى إعادة الإرسال");
  assert.equal(formatted.rejectedByEmail, "admin@hasanchartworld.com");
  assert.equal(formatted.notificationStatus, "تم");
  assert.equal(formatted.emailStatus, "تم وضعه في قائمة الإرسال");
  assert.doesNotMatch(JSON.stringify(formatted), /adminId|"details"/);
}

async function testEnrichRejectedRequestsWithAuditDetails() {
  const supabase = createMockSupabase(null, {
    adminLogs: [
      {
        action: "reject-subscription-request",
        target_id: REQUEST_ID,
        admin_email: "admin@hasanchartworld.com",
        created_at: "2026-07-02T12:00:00.000Z",
        details: {
          rejectionReason: "إثبات الدفع غير صحيح",
          adminNotes: "أعد الإرسال",
          timestamp: "2026-07-02T12:00:00.000Z",
          adminEmail: "admin@hasanchartworld.com",
          notificationCreated: false,
          emailQueued: true,
        },
      },
    ],
  });

  const enriched = await enrichSubscriptionRequestsWithRejectionDetails(supabase, [
    { id: REQUEST_ID, status: "مرفوض", plan_name: "VIP Spot" },
  ]);

  assert.equal(enriched[0].rejection_details.rejectionReason, "إثبات الدفع غير صحيح");
  assert.equal(enriched[0].rejection_details.emailQueued, true);
}

async function testRejectResponseIncludesRejectionDetailsWithoutAdminId() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
    payment_proof: PAYMENT_PROOF,
  });

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "بيانات غير مكتملة",
    rejectionNotes: "أعد الإرسال",
    ...createRejectSideEffectMocks(),
  });

  assert.equal(result.rejectionDetails.rejectionReason, "بيانات غير مكتملة");
  assert.equal(result.rejectionDetails.adminNotes, "أعد الإرسال");
  assert.equal(result.rejectionDetails.rejectedByEmail, ADMIN_USER.email);
  assert.equal(Object.prototype.hasOwnProperty.call(result.rejectionDetails, "adminId"), false);
}

async function testEmailContentHasNoInternalData() {
  const content = buildSubscriptionRejectedEmailContent({
    username: "Hasan User",
    planName: "VIP Spot",
    price: "50 USDT",
    createdAt: "2026-07-01T10:00:00.000Z",
    rejectionReason: "صورة الدفع غير واضحة",
    adminNotes: "يرجى إعادة الإرسال",
    requestId: REQUEST_ID,
  });

  const html = buildEmailLayout({
    title: "تم رفض طلب الاشتراك",
    content,
    actionText: "إعادة تقديم الطلب",
    actionUrl: buildSubscriptionResubmitUrl(getSiteUrl()),
    secondaryActionText: "التواصل مع الدعم الفني",
    secondaryActionUrl: SUBSCRIPTION_REJECTED_SUPPORT_URL,
  });

  assert.match(content, /Hasan User/);
  assert.match(content, /VIP Spot/);
  assert.match(content, /صورة الدفع غير واضحة/);
  assert.doesNotMatch(html, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.doesNotMatch(html, /admin@hasanchartworld.com/);
  assert.doesNotMatch(html, /adminId/);
  assert.doesNotMatch(html, /payment_proof/);
}

async function testConcurrentRejectBlocked() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "بيانات غير مكتملة",
    dispatchAlerts: async () => {
      await gate;
      return { notificationCreated: true };
    },
    dispatchRejectedEmail: async () => ({ emailQueued: true }),
  });

  await assert.rejects(
    () =>
      rejectSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        rejectionReason: "بيانات غير مكتملة",
      }),
    (error) => error.status === 409 && /يتم معالجة/.test(error.message)
  );

  releaseFirst();
  const result = await first;
  assert.equal(result.success, true);
}

async function testCanRejectUiGuard() {
  assert.equal(canRejectSubscriptionRequest("قيد المعالجة"), true);
  assert.equal(canRejectSubscriptionRequest("مرفوض"), false);
  assert.equal(canRejectSubscriptionRequest("مفعل"), false);
  assert.equal(canRejectSubscriptionRequest("نشط"), false);
}

async function testNotesMaxLength() {
  assert.throws(
    () =>
      validateSubscriptionRejectPayload({
        rejectionReason: "سبب",
        rejectionNotes: "x".repeat(501),
      }),
    (error) => error.status === 400
  );
}

async function testRejectSuccessWithAuditFailure() {
  __resetSubscriptionRejectLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const originalFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    if (table === "admin_logs") {
      return {
        insert() {
          return Promise.resolve({ error: { message: "audit insert failed" } });
        },
      };
    }
    return originalFrom(table);
  };

  const result = await rejectSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    rejectionReason: "بيانات غير مكتملة",
    ...createRejectSideEffectMocks(),
  });

  assert.equal(result.success, true);
  assert.equal(result.auditLogged, false);
  assert.match(result.auditWarning, /تعذر تسجيل العملية/);
}

async function testRejectSelectExcludesPaymentProofColumn() {
  const source = readFileSync(
    new URL("../lib/admin-subscription-request-reject.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /\.select\("id,user_email,username,plan_name,price,status,created_at"\)/);
  assert.doesNotMatch(source, /select\("[^"]*payment_proof/);
}

function testSubscriptionRequestIdAcceptsLegacyBigint() {
  assert.equal(normalizeSubscriptionRequestId("1234567890"), "1234567890");
  assert.equal(
    requireValidSubscriptionRequestId("11111111-1111-4111-8111-111111111111"),
    "11111111-1111-4111-8111-111111111111"
  );
}

function testSubscriptionRequestIdRejectsInvalidValues() {
  const invalidValues = [
    undefined,
    null,
    "",
    "   ",
    "0",
    "-123",
    "-1",
    "123abc",
    "abc123",
    "123/456",
    "../123",
    "123-456",
    "12.34",
    "not-an-id",
    "user-id-abc",
    "123 456",
    "123;drop",
  ];

  for (const value of invalidValues) {
    assert.equal(normalizeSubscriptionRequestId(value), null, `expected null for ${String(value)}`);
    assert.throws(
      () => requireValidSubscriptionRequestId(value),
      /INVALID_REQUESTID/,
      `expected throw for ${String(value)}`
    );
  }
}

function testSubscriptionRequestIdPreservesLargeBigintString() {
  const largeId = "9007199254740993";

  assert.equal(requireValidSubscriptionRequestId(largeId), largeId);
  assert.notEqual(Number(largeId).toString(), largeId, "Number() must not be used for large ids");
}

function testRejectLibUsesStringIdWithoutNumberConversion() {
  const source = readFileSync(
    new URL("../lib/admin-subscription-request-reject.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /\.eq\("id", normalizedRequestId\)/);
  assert.doesNotMatch(source, /parseInt\([^\)]*requestId/);
  assert.doesNotMatch(source, /Number\([^\)]*requestId/);
}

function testRejectRouteUsesSubscriptionRequestIdValidator() {
  const routeSource = readFileSync(
    new URL("../app/api/admin/subscription-requests/[requestId]/reject/route.js", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /requireValidSubscriptionRequestId\(params\?\.requestId/);
  assert.doesNotMatch(routeSource, /requireValidUuid/);
  assert.doesNotMatch(routeSource, /parseInt\([^\)]*requestId/);
  assert.doesNotMatch(routeSource, /Number\([^\)]*requestId/);
}

function testRejectRouteValidationMatchesParamShape() {
  const validBigint = requireValidSubscriptionRequestId("42");
  const validUuid = requireValidSubscriptionRequestId("11111111-1111-4111-8111-111111111111");
  const invalid = normalizeSubscriptionRequestId("bad-id");

  assert.equal(validBigint, "42");
  assert.equal(validUuid, "11111111-1111-4111-8111-111111111111");
  assert.equal(invalid, null);
}

const tests = [
  ["successful reject + notification + email queue", testSuccessfulRejectWithNotificationAndEmail],
  ["empty reason rejected", testEmptyReasonRejected],
  ["request not found", testRequestNotFound],
  ["non-admin blocked", testNonAdminAccessBlocked],
  ["already rejected", testAlreadyRejected],
  ["reject success with notification failure", testRejectSuccessWithNotificationFailure],
  ["reject success with email queue failure", testRejectSuccessWithEmailQueueFailure],
  ["no email when update fails", testNoEmailWhenUpdateFails],
  ["prevent duplicate email dispatch", testPreventDuplicateEmailDispatch],
  ["payment proof preserved after reject", testPaymentProofPreservedAfterReject],
  ["reject does not delete storage or recreate request", testRejectDoesNotDeleteStorageOrRecreateRequest],
  ["rejected email has resubmit and support buttons", testRejectedEmailHasResubmitAndSupportButtons],
  ["resubmit url uses site url", testResubmitUrlUsesSiteUrl],
  ["resubmit path points to subscriptions form", testResubmitPathPointsToSubscriptionsForm],
  ["rejection details from audit log", testRejectionDetailsFromAuditLog],
  ["enrich rejected requests with audit details", testEnrichRejectedRequestsWithAuditDetails],
  ["reject response includes rejection details without admin id", testRejectResponseIncludesRejectionDetailsWithoutAdminId],
  ["email content excludes internal data", testEmailContentHasNoInternalData],
  ["concurrent reject blocked", testConcurrentRejectBlocked],
  ["reject success with audit failure", testRejectSuccessWithAuditFailure],
  ["reject select excludes payment_proof column", testRejectSelectExcludesPaymentProofColumn],
  ["subscription request id accepts legacy bigint", testSubscriptionRequestIdAcceptsLegacyBigint],
  ["subscription request id rejects invalid values", testSubscriptionRequestIdRejectsInvalidValues],
  ["subscription request id preserves large bigint string", testSubscriptionRequestIdPreservesLargeBigintString],
  ["reject lib uses string id without number conversion", testRejectLibUsesStringIdWithoutNumberConversion],
  ["reject route uses subscription request id validator", testRejectRouteUsesSubscriptionRequestIdValidator],
  ["reject route validation matches param shape", testRejectRouteValidationMatchesParamShape],
  ["ui reject guard", testCanRejectUiGuard],
  ["notes max length", testNotesMaxLength],
];

let passed = 0;

for (const [name, run] of tests) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} subscription reject checks passed`);

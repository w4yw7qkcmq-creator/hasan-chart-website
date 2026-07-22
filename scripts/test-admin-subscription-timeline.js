import assert from "node:assert/strict";
import {
  buildSubscriptionRequestTimeline,
  buildSubscriptionTimelineSummary,
  enrichSubscriptionRequestsWithTimeline,
  shouldShowSparseTimelineMessage,
} from "../lib/admin-subscription-request-timeline.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

const BASE_ROW = {
  id: REQUEST_ID,
  user_email: "user@example.com",
  username: "Hasan User",
  plan_name: "VIP Spot",
  price: "50 USDT",
  payment_proof: "https://cdn.example.com/proof.jpg",
  status: "بانتظار المراجعة",
  created_at: "2026-06-10T07:22:00.000Z",
};

function testTimelineSortedChronologically() {
  const timeline = buildSubscriptionRequestTimeline(BASE_ROW, [
    {
      id: "log-2",
      action: "update-subscription-request",
      created_at: "2026-06-11T08:00:00.000Z",
      admin_email: "admin@hasanchartworld.com",
      details: { status: "تمت المراجعة" },
    },
    {
      id: "log-1",
      action: "update-subscription-request",
      created_at: "2026-06-10T09:00:00.000Z",
      admin_email: "admin@hasanchartworld.com",
      details: { status: "قيد المراجعة" },
    },
  ]);

  assert.equal(timeline[0].type, "created");
  assert.equal(timeline[1].type, "payment_proof");
  assert.equal(timeline[2].type, "review_started");
  assert.equal(timeline[3].type, "reviewed");

  for (let index = 1; index < timeline.length; index += 1) {
    const previous = new Date(timeline[index - 1].occurredAt).getTime();
    const current = new Date(timeline[index].occurredAt).getTime();
    assert.ok(current >= previous, "timeline must be chronological");
  }
}

function testNoDuplicateRejectedEvents() {
  const timeline = buildSubscriptionRequestTimeline(
    { ...BASE_ROW, status: "مرفوض" },
    [
      {
        id: "reject-log",
        action: "reject-subscription-request",
        created_at: "2026-06-11T09:00:00.000Z",
        admin_email: "admin@hasanchartworld.com",
        details: {
          rejectionReason: "الصورة غير واضحة",
          adminNotes: "أعد الإرسال",
          notificationCreated: true,
          emailQueued: true,
          timestamp: "2026-06-11T09:00:00.000Z",
        },
      },
      {
        id: "status-log",
        action: "update-subscription-request",
        created_at: "2026-06-11T09:01:00.000Z",
        admin_email: "admin@hasanchartworld.com",
        details: { status: "مرفوض" },
      },
    ]
  );

  const rejectedEvents = timeline.filter((event) => event.type === "rejected");
  assert.equal(rejectedEvents.length, 1);
  assert.match(rejectedEvents[0].description, /الصورة غير واضحة/);
  assert.match(rejectedEvents[0].description, /الإشعار الداخلي: تم/);
  assert.match(rejectedEvents[0].description, /إيميل الرفض: تم وضعه في قائمة الإرسال/);
  assert.doesNotMatch(timeline.map((event) => event.type).join(","), /email_sent/);
  assert.doesNotMatch(timeline.map((event) => event.type).join(","), /notification/);
}

function testSparseTimelineMessage() {
  const timeline = buildSubscriptionRequestTimeline(BASE_ROW, []);
  assert.equal(timeline.length, 2);
  assert.equal(shouldShowSparseTimelineMessage(timeline, []), true);
}

function testRejectEventIncludesReasonAndAdmin() {
  const timeline = buildSubscriptionRequestTimeline(
    { ...BASE_ROW, status: "مرفوض" },
    [
      {
        id: "reject-log",
        action: "reject-subscription-request",
        created_at: "2026-06-11T09:00:00.000Z",
        admin_email: "admin@hasanchartworld.com",
        details: {
          rejectionReason: "المبلغ غير مطابق",
          adminNotes: "تحقق من المبلغ",
          notificationCreated: false,
          emailQueued: false,
          timestamp: "2026-06-11T09:00:00.000Z",
        },
      },
    ]
  );

  const rejected = timeline.find((event) => event.type === "rejected");
  assert.ok(rejected);
  assert.match(rejected.description, /المبلغ غير مطابق/);
  assert.match(rejected.description, /admin@hasanchartworld.com/);
  assert.match(rejected.description, /الإشعار الداخلي: تعذر/);
  assert.match(rejected.description, /إيميل الرفض: تعذر/);
}

function testActivationEventFromAuditLog() {
  const timeline = buildSubscriptionRequestTimeline(
    { ...BASE_ROW, status: "مفعل", started_at: "2026-06-12T10:00:00.000Z" },
    [
      {
        id: "activate-log",
        action: "update-subscription-request",
        created_at: "2026-06-12T10:00:00.000Z",
        admin_email: "admin@hasanchartworld.com",
        details: {
          status: "مفعل",
          planName: "VIP Spot",
          expiresAt: "2026-07-12T10:00:00.000Z",
        },
      },
    ]
  );

  const activatedEvents = timeline.filter((event) => event.type === "activated");
  assert.equal(activatedEvents.length, 1);
  assert.match(activatedEvents[0].description, /VIP Spot/);
}

function testTimelineSummary() {
  const logs = [
    {
      id: "log-1",
      action: "update-subscription-request",
      created_at: "2026-06-10T09:00:00.000Z",
      admin_email: "first@hasanchartworld.com",
      details: { status: "قيد المراجعة" },
    },
    {
      id: "log-2",
      action: "reject-subscription-request",
      created_at: "2026-06-11T09:00:00.000Z",
      admin_email: "admin@hasanchartworld.com",
      details: {
        rejectionReason: "الصورة غير واضحة",
        notificationCreated: true,
        emailQueued: true,
      },
    },
  ];

  const timeline = buildSubscriptionRequestTimeline(BASE_ROW, logs);
  const summary = buildSubscriptionTimelineSummary(timeline, logs);

  assert.equal(summary.totalEvents, timeline.length);
  assert.equal(summary.lastAdminEmail, "admin@hasanchartworld.com");
  assert.equal(summary.hasAdminHistory, true);
}

function testSingleAdminLogsQueryDuringEnrichment() {
  let adminLogsQueryCount = 0;

  const supabase = {
    from(table) {
      if (table !== "admin_logs") {
        throw new Error(`Unexpected table: ${table}`);
      }

      adminLogsQueryCount += 1;

      return {
        select() {
          return {
            eq() {
              return {
                in() {
                  return {
                    order() {
                      return Promise.resolve({
                        data: [
                          {
                            id: "reject-log",
                            action: "reject-subscription-request",
                            target_id: REQUEST_ID,
                            created_at: "2026-06-11T09:00:00.000Z",
                            admin_email: "admin@hasanchartworld.com",
                            details: {
                              rejectionReason: "الصورة غير واضحة",
                              notificationCreated: true,
                              emailQueued: true,
                            },
                          },
                        ],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return enrichSubscriptionRequestsWithTimeline(supabase, [BASE_ROW]).then((rows) => {
    assert.equal(adminLogsQueryCount, 1);
    assert.equal(rows[0].timeline.length >= 3, true);
    assert.equal(rows[0].rejection_details.rejectionReason, "الصورة غير واضحة");
    assert.equal(rows[0].timeline_sparse, false);
  });
}

const tests = [
  ["timeline sorted chronologically", testTimelineSortedChronologically],
  ["no duplicate rejected events", testNoDuplicateRejectedEvents],
  ["sparse timeline message", testSparseTimelineMessage],
  ["reject event includes reason and admin", testRejectEventIncludesReasonAndAdmin],
  ["activation event from audit log", testActivationEventFromAuditLog],
  ["timeline summary", testTimelineSummary],
  ["single admin_logs query during enrichment", testSingleAdminLogsQueryDuringEnrichment],
];

let passed = 0;

for (const [name, run] of tests) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} subscription timeline checks passed`);

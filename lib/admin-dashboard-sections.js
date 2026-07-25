import { buildAdminNotificationsFeed } from "./admin-notifications-feed";
import { loadAdminActivityFeed } from "./admin-activity-feed";
import { enrichSubscriptionRequestsWithTimeline } from "./admin-subscription-request-timeline.js";
import { formatPartnerMoney } from "./partner-shared";
import {
  PENDING_ADMIN_DB_STATUSES,
  PENDING_ANALYSIS_DB_STATUSES,
  PENDING_PARTNER_WITHDRAWAL_DB_STATUSES,
  REVIEWED_ADMIN_DB_STATUSES,
} from "./admin-status-constants.js";
import { countPendingPaymentReviews } from "./financial-center/pending-payment-review.js";

export const ADMIN_DASHBOARD_PAGE_SIZE = 20;
export const ADMIN_DASHBOARD_STATS_CACHE_MS = 20_000;
export const ADMIN_DASHBOARD_SECTION_CACHE_MS = 12_000;
export const ADMIN_ACTIVITY_FEED_CACHE_MS = 25_000;

export const ADMIN_DASHBOARD_SECTIONS = new Set([
  "stats",
  "overview",
  "activity-feed",
  "analysis",
  "accounts",
  "subscriptions",
  "users",
  "withdrawals",
  "notifications",
]);

function sanitizeAccountRequest(item) {
  return {
    id: item.id,
    user_id: item.user_id,
    email: item.email,
    platform: item.platform,
    account_type: item.account_type,
    capital: item.capital,
    contact_method: item.contact_method,
    notes: item.notes,
    status: item.status,
    created_at: item.created_at,
    has_sensitive_keys: Boolean(
      item.api_key_encrypted ||
        item.secret_key_encrypted ||
        item.trading_password_encrypted
    ),
  };
}

function logAdminDashboardSection(event, payload = {}) {
  console.info(event, payload);
}

function logAdminDbQuery(event, payload = {}) {
  console.info(event, payload);
}

async function runAdminDbQuery(section, queryName, runner) {
  const startedAt = Date.now();
  logAdminDbQuery("ADMIN_DB_QUERY_STARTED", { section, queryName });

  try {
    const result = await runner();
    let returnedRows = 0;

    if (typeof result?.count === "number") {
      returnedRows = result.count;
    } else if (Array.isArray(result?.data)) {
      returnedRows = result.data.length;
    } else if (Array.isArray(result)) {
      returnedRows = result.length;
    }

    logAdminDbQuery("ADMIN_DB_QUERY_FINISHED", {
      section,
      queryName,
      durationMs: Date.now() - startedAt,
      returnedRows,
    });

    return result;
  } catch (error) {
    logAdminDbQuery("ADMIN_DB_QUERY_FAILED", {
      section,
      queryName,
      durationMs: Date.now() - startedAt,
      error: error?.message || "unknown",
    });
    throw error;
  }
}

async function countRows(supabase, table, { statusIn = null, section = "stats", queryName } = {}) {
  const resolvedQueryName =
    queryName ||
    `count_${table}${statusIn?.length ? "_filtered" : "_total"}`;

  try {
    const result = await runAdminDbQuery(section, resolvedQueryName, async () => {
      let query = supabase.from(table).select("id", { count: "exact", head: true });

      if (statusIn?.length) {
        query = query.in("status", statusIn);
      }

      const response = await query;
      if (response.error) {
        throw response.error;
      }

      return { count: response.count ?? 0 };
    });

    return { count: result.count ?? 0, error: null };
  } catch (error) {
    return { count: 0, error: error?.message || "unknown" };
  }
}

async function fetchAnalysisList(supabase, section, { limit, pendingOnly = false } = {}) {
  return runAdminDbQuery(
    section,
    pendingOnly ? "analysis_requests_pending_recent" : "analysis_requests_recent",
    async () => {
      let query = supabase
        .from("analysis_requests")
        .select(
          pendingOnly
            ? "id,user_email,username,coin,frame,status,created_at"
            : "id,user_email,username,coin,frame,status,reply,reply_image,created_at,job_status,completed_at,error_message"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (pendingOnly) {
        query = query.in("status", PENDING_ANALYSIS_DB_STATUSES);
      }

      const response = await query;
      if (response.error) {
        throw response.error;
      }

      return response;
    }
  );
}

async function fetchAccountList(supabase, section, { limit, pendingOnly = false } = {}) {
  return runAdminDbQuery(
    section,
    pendingOnly ? "account_management_requests_pending_recent" : "account_management_requests_recent",
    async () => {
      let query = supabase
        .from("account_management_requests")
        .select(
          pendingOnly
            ? "id,email,platform,account_type,status,created_at,contact_method"
            : "id,user_id,email,platform,account_type,capital,contact_method,notes,status,created_at,api_key_encrypted,secret_key_encrypted,trading_password_encrypted"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (pendingOnly) {
        query = query.in("status", PENDING_ADMIN_DB_STATUSES);
      }

      const response = await query;
      if (response.error) {
        throw response.error;
      }

      return response;
    }
  );
}

export const SUBSCRIPTION_LIST_SELECT_FIELDS =
  "id,user_email,username,plan_name,category,price,telegram_username,status,started_at,expires_at,created_at";

async function fetchSubscriptionList(supabase, section, { limit, pendingOnly = false } = {}) {
  return runAdminDbQuery(
    section,
    pendingOnly ? "subscription_requests_pending_recent" : "subscription_requests_recent",
    async () => {
      let query = supabase
        .from("subscription_requests")
        .select(
          pendingOnly
            ? "id,user_email,username,plan_name,price,status,created_at"
            : SUBSCRIPTION_LIST_SELECT_FIELDS
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (pendingOnly) {
        query = query.in("status", PENDING_ADMIN_DB_STATUSES);
      }

      const response = await query;
      if (response.error) {
        throw response.error;
      }

      return response;
    }
  );
}

async function fetchProfilesList(supabase, section, limit) {
  return runAdminDbQuery(section, "profiles_recent", async () => {
    const response = await supabase
      .from("profiles")
      .select("id,email,username,telegram,role,subscription_plan,subscription_status,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (response.error) {
      throw response.error;
    }

    return response;
  });
}

async function fetchPendingWithdrawals(supabase, section, limit) {
  return runAdminDbQuery(section, "partner_withdrawals_pending_recent", async () => {
    const response = await supabase
      .from("partner_withdrawals")
      .select("id, partner_id, amount, currency, status, created_at, partners(user_id)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (response.error) {
      throw response.error;
    }

    return response;
  });
}

export async function loadAdminDashboardSection(supabase, section, options = {}) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(Number(options.limit) || ADMIN_DASHBOARD_PAGE_SIZE, 1), 50);

  logAdminDashboardSection("ADMIN_SECTION_LOAD_STARTED", {
    section,
    limit,
  });

  try {
    let payload = { success: true, section };

    if (section === "stats") {
      const [
        analysisTotal,
        analysisPending,
        analysisReviewed,
        accountsTotal,
        accountsPending,
        subscriptionsTotal,
        subscriptionsPending,
        pendingPaymentReviews,
        usersTotal,
        withdrawalsPending,
      ] = await Promise.all([
        countRows(supabase, "analysis_requests", {
          queryName: "count_analysis_requests_total",
        }),
        countRows(supabase, "analysis_requests", {
          statusIn: PENDING_ANALYSIS_DB_STATUSES,
          queryName: "count_analysis_requests_pending",
        }),
        countRows(supabase, "analysis_requests", {
          statusIn: REVIEWED_ADMIN_DB_STATUSES,
          queryName: "count_analysis_requests_reviewed",
        }),
        countRows(supabase, "account_management_requests", {
          queryName: "count_account_management_requests_total",
        }),
        countRows(supabase, "account_management_requests", {
          statusIn: PENDING_ADMIN_DB_STATUSES,
          queryName: "count_account_management_requests_pending",
        }),
        countRows(supabase, "subscription_requests", {
          queryName: "count_subscription_requests_total",
        }),
        countRows(supabase, "subscription_requests", {
          statusIn: PENDING_ADMIN_DB_STATUSES,
          queryName: "count_subscription_requests_pending",
        }),
        countPendingPaymentReviews(supabase),
        countRows(supabase, "profiles", {
          queryName: "count_profiles_total",
        }),
        countRows(supabase, "partner_withdrawals", {
          statusIn: PENDING_PARTNER_WITHDRAWAL_DB_STATUSES,
          queryName: "count_partner_withdrawals_pending",
        }),
      ]);

      payload.stats = {
        analysisTotal: analysisTotal.count,
        analysisPending: analysisPending.count,
        analysisReviewed: analysisReviewed.count,
        accountsTotal: accountsTotal.count,
        accountsPending: accountsPending.count,
        subscriptionsTotal: subscriptionsTotal.count,
        subscriptionsPending: subscriptionsPending.count,
        pendingPaymentReviews,
        usersCount: usersTotal.count,
        withdrawalsPending: withdrawalsPending.count,
      };
      payload.returnedRows = 0;
    } else if (section === "analysis") {
      const { data, error } = await fetchAnalysisList(supabase, section, { limit });

      if (error) throw error;
      payload.analysis_requests = data || [];
      payload.returnedRows = payload.analysis_requests.length;
    } else if (section === "accounts") {
      const { data, error } = await fetchAccountList(supabase, section, { limit });

      if (error) throw error;
      payload.account_management_requests = (data || []).map(sanitizeAccountRequest);
      payload.returnedRows = payload.account_management_requests.length;
    } else if (section === "subscriptions") {
      console.info("ADMIN_SUBSCRIPTIONS_LOAD_STEP", { step: "fetch_subscription_requests_start" });
      const fetchStartedAt = Date.now();
      const { data, error } = await fetchSubscriptionList(supabase, section, { limit });

      if (error) {
        console.error("ADMIN_SUBSCRIPTIONS_LOAD_FAILED", {
          step: "fetch_subscription_requests",
          durationMs: Date.now() - fetchStartedAt,
          message: error.message || String(error),
          code: error.code || null,
          details: error.details || null,
          hint: error.hint || null,
        });
        throw error;
      }

      console.info("ADMIN_SUBSCRIPTIONS_LOAD_STEP", {
        step: "fetch_subscription_requests_ok",
        durationMs: Date.now() - fetchStartedAt,
        rowCount: (data || []).length,
        paymentProofBytes: (data || []).reduce(
          (sum, row) => sum + String(row?.payment_proof || "").length,
          0
        ),
      });

      const rowsForEnrichment = (data || []).map((row) => ({
        ...row,
        has_payment_proof: true,
      }));

      const enrichStartedAt = Date.now();
      try {
        payload.subscription_requests = await enrichSubscriptionRequestsWithTimeline(
          supabase,
          rowsForEnrichment
        );
        console.info("ADMIN_SUBSCRIPTIONS_LOAD_STEP", {
          step: "enrich_subscription_timeline_ok",
          durationMs: Date.now() - enrichStartedAt,
          rowCount: payload.subscription_requests.length,
        });
      } catch (enrichError) {
        console.error("ADMIN_SUBSCRIPTIONS_LOAD_FAILED", {
          step: "enrich_subscription_timeline",
          durationMs: Date.now() - enrichStartedAt,
          message: enrichError?.message || String(enrichError),
          stack: enrichError?.stack || null,
        });
        throw enrichError;
      }

      payload.returnedRows = payload.subscription_requests.length;
    } else if (section === "users") {
      const { data, error } = await fetchProfilesList(supabase, section, limit);

      if (error) throw error;
      payload.profiles = data || [];
      payload.returnedRows = payload.profiles.length;
    } else if (section === "withdrawals") {
      const { data, error } = await fetchPendingWithdrawals(supabase, section, limit);

      if (error) throw error;
      payload.withdrawals = (data || []).map((row) => ({
        id: row.id,
        status: row.status,
        amount: row.amount,
        amountLabel: formatPartnerMoney(row.amount),
        created_at: row.created_at,
        partner_email: null,
        partnerLabel: row.partner_id ? `شريك #${String(row.partner_id).slice(0, 8)}` : "شريك",
      }));
      payload.returnedRows = payload.withdrawals.length;
    } else if (section === "activity-feed") {
      const feed = await loadAdminActivityFeed(supabase, { limit: 20 });
      payload.events = feed.events || [];
      payload.sources = feed.sources || {};
      payload.partialFailure = Boolean(feed.partialFailure);
      payload.allSourcesFailed = Boolean(feed.allSourcesFailed);
      payload.returnedRows = feed.returnedRows || 0;
    } else if (section === "overview" || section === "notifications") {
      const [analysis, accounts, subscriptions, pendingWithdrawals] = await Promise.all([
        fetchAnalysisList(supabase, section, { limit: 3, pendingOnly: true }),
        fetchAccountList(supabase, section, { limit: 3, pendingOnly: true }),
        fetchSubscriptionList(supabase, section, { limit: 3, pendingOnly: true }),
        fetchPendingWithdrawals(supabase, section, 5),
      ]);

      const adminNotifications = buildAdminNotificationsFeed({
        analysis: analysis.error ? [] : analysis.data || [],
        subscriptions: subscriptions.error ? [] : subscriptions.data || [],
        accounts: accounts.error ? [] : accounts.data || [],
        withdrawals: pendingWithdrawals.error
          ? []
          : (pendingWithdrawals.data || []).map((row) => ({
              id: row.id,
              status: row.status,
              amount: row.amount,
              amountLabel: formatPartnerMoney(row.amount),
              created_at: row.created_at,
              partner_email: null,
              partnerLabel: row.partner_id ? `شريك #${String(row.partner_id).slice(0, 8)}` : "شريك",
            })),
      });

      payload.admin_notifications = adminNotifications;
      payload.admin_notifications_count = adminNotifications.length;
      payload.returnedRows = adminNotifications.length;
    } else {
      const error = new Error("قسم غير مدعوم");
      error.status = 400;
      throw error;
    }

    logAdminDashboardSection("ADMIN_SECTION_LOAD_FINISHED", {
      section,
      durationMs: Date.now() - startedAt,
      returnedRows: payload.returnedRows ?? 0,
    });

    return payload;
  } catch (error) {
    logAdminDashboardSection("ADMIN_SECTION_LOAD_FAILED", {
      section,
      durationMs: Date.now() - startedAt,
      error: error?.message || "unknown",
    });
    throw error;
  }
}

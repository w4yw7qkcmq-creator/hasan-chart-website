import { fetchWithTimeout } from "../../fetch-with-timeout.js";

const FLOW_CONFLICT_COLUMNS = "symbol,exchange_scope,bucket_start";
const LARGE_TRADE_CONFLICT_COLUMN = "trade_key";

/**
 * @param {number} status
 * @returns {string}
 */
function safeErrorMessage(status) {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "validation_error";
  return "request_failed";
}

/**
 * @param {unknown} error
 * @returns {{ errorCode: string, errorMessageSafe: string, retryable: boolean, status: number }}
 */
function mapFetchError(error) {
  const isTimeout =
    error?.code === "FETCH_TIMEOUT" || error?.message === "FETCH_TIMEOUT";
  if (isTimeout) {
    return {
      status: 408,
      errorCode: "TIMEOUT",
      errorMessageSafe: "timeout",
      retryable: true,
    };
  }
  return {
    status: 0,
    errorCode: "NETWORK",
    errorMessageSafe: "network_error",
    retryable: true,
  };
}

/**
 * @param {import("./market-history-writer.js").FlowBucketWriteRow} row
 */
function mapFlowBucketRow(row) {
  return {
    symbol: row.symbol,
    exchange_scope: row.exchangeScope,
    bucket_start: new Date(row.bucketStart).toISOString(),
    bucket_seconds: row.bucketSeconds,
    buy_notional: row.buyNotional,
    sell_notional: row.sellNotional,
    buy_count: row.buyCount,
    sell_count: row.sellCount,
    max_trade_notional: row.maxTradeNotional,
    large_25k_count: row.large25kCount,
    large_50k_count: row.large50kCount,
    large_100k_count: row.large100kCount,
    large_250k_count: row.large250kCount,
    large_500k_count: row.large500kCount,
    large_1m_count: row.large1mCount,
  };
}

/**
 * @param {import("./market-history-writer.js").LargeTradeWriteRow} row
 */
function mapLargeTradeRow(row) {
  return {
    trade_key: row.tradeKey,
    symbol: row.symbol,
    exchange: row.exchange,
    ts: new Date(row.ts).toISOString(),
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    notional: row.notional,
    threshold_band: row.thresholdBand,
  };
}

/**
 * @param {{
 *   url?: string,
 *   serviceKey?: string,
 *   timeoutMs?: number,
 *   fetchFn?: typeof fetchWithTimeout,
 * }} [options]
 */
export function createSupabaseHistoryClient(options = {}) {
  const url = String(options.url ?? process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const serviceKey = String(
    options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ).trim();
  const timeoutMs = options.timeoutMs ?? 8_000;
  const fetchFn = options.fetchFn ?? fetchWithTimeout;

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_HISTORY_CLIENT_MISSING_CONFIG");
  }

  /**
   * @param {import("./market-history-writer.js").FlowBucketWriteRow[]} rows
   */
  async function upsertFlowBuckets(rows) {
    const started = Date.now();
    if (!rows.length) {
      return {
        ok: true,
        status: 200,
        written: 0,
        skipped: 0,
        latencyMs: 0,
      };
    }

    try {
      const response = await fetchFn(
        `${url}/rest/v1/market_flow_buckets?on_conflict=${FLOW_CONFLICT_COLUMNS}`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows.map(mapFlowBucketRow)),
        },
        timeoutMs,
      );

      const latencyMs = Date.now() - started;
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          written: rows.length,
          skipped: 0,
          latencyMs,
        };
      }

      return {
        ok: false,
        status: response.status,
        written: 0,
        skipped: 0,
        errorCode: String(response.status),
        errorMessageSafe: safeErrorMessage(response.status),
        latencyMs,
        retryable: response.status === 429 || response.status >= 500,
      };
    } catch (error) {
      const mapped = mapFetchError(error);
      return {
        ok: false,
        status: mapped.status,
        written: 0,
        skipped: 0,
        errorCode: mapped.errorCode,
        errorMessageSafe: mapped.errorMessageSafe,
        latencyMs: Date.now() - started,
        retryable: mapped.retryable,
      };
    }
  }

  /**
   * @param {import("./market-history-writer.js").LargeTradeWriteRow[]} rows
   */
  async function insertLargeTrades(rows) {
    const started = Date.now();
    if (!rows.length) {
      return {
        ok: true,
        status: 200,
        written: 0,
        skipped: 0,
        latencyMs: 0,
      };
    }

    try {
      const response = await fetchFn(
        `${url}/rest/v1/market_large_trades?on_conflict=${LARGE_TRADE_CONFLICT_COLUMN}`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify(rows.map(mapLargeTradeRow)),
        },
        timeoutMs,
      );

      const latencyMs = Date.now() - started;
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          written: rows.length,
          skipped: 0,
          latencyMs,
        };
      }

      return {
        ok: false,
        status: response.status,
        written: 0,
        skipped: 0,
        errorCode: String(response.status),
        errorMessageSafe: safeErrorMessage(response.status),
        latencyMs,
        retryable: response.status === 429 || response.status >= 500,
      };
    } catch (error) {
      const mapped = mapFetchError(error);
      return {
        ok: false,
        status: mapped.status,
        written: 0,
        skipped: 0,
        errorCode: mapped.errorCode,
        errorMessageSafe: mapped.errorMessageSafe,
        latencyMs: Date.now() - started,
        retryable: mapped.retryable,
      };
    }
  }

  return {
    upsertFlowBuckets,
    insertLargeTrades,
  };
}

export {
  FLOW_CONFLICT_COLUMNS,
  LARGE_TRADE_CONFLICT_COLUMN,
  mapFlowBucketRow,
  mapLargeTradeRow,
  safeErrorMessage,
};

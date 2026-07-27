export const EXCHANGE_COUNT = 3;

export const CONNECTION_LABELS = {
  connecting: "جاري الاتصال",
  connected: "متصل لحظيًا",
  degraded: "اتصال جزئي",
  reconnecting: "إعادة الاتصال",
  disconnected: "غير متصل",
};

export function countHealthyExchanges(exchangeStatuses = []) {
  return exchangeStatuses.filter((row) => row?.synced && !row?.stale).length;
}

/**
 * @param {object} options
 * @param {"connecting"|"open"|"reconnecting"|"disconnected"} options.ssePhase
 * @param {object|null} options.payload
 * @param {boolean} options.browserOnline
 */
export function resolveMarketDepthConnectionStatus({
  ssePhase = "connecting",
  payload = null,
  browserOnline = true,
} = {}) {
  const total = EXCHANGE_COUNT;
  const healthyCount = countHealthyExchanges(payload?.exchangeStatuses);

  if (!browserOnline) {
    return {
      status: "disconnected",
      label: CONNECTION_LABELS.disconnected,
      healthyCount,
      total,
    };
  }

  if (ssePhase === "connecting") {
    return {
      status: "connecting",
      label: CONNECTION_LABELS.connecting,
      healthyCount,
      total,
    };
  }

  const payloadIsFresh =
    Boolean(payload?.success) &&
    !payload?.stale &&
    healthyCount > 0 &&
    (ssePhase === "open" || ssePhase === "reconnecting");

  if (payloadIsFresh) {
    if (healthyCount >= total) {
      return {
        status: "connected",
        label: CONNECTION_LABELS.connected,
        healthyCount,
        total,
      };
    }

    return {
      status: "degraded",
      label: CONNECTION_LABELS.degraded,
      healthyCount,
      total,
    };
  }

  if (ssePhase === "reconnecting") {
    return {
      status: "reconnecting",
      label: CONNECTION_LABELS.reconnecting,
      healthyCount,
      total,
    };
  }

  if (ssePhase === "open" && healthyCount === 0) {
    return {
      status: "reconnecting",
      label: CONNECTION_LABELS.reconnecting,
      healthyCount,
      total,
    };
  }

  return {
    status: "disconnected",
    label: CONNECTION_LABELS.disconnected,
    healthyCount,
    total,
  };
}

export function formatExchangeConnectionHint(connection) {
  return `${connection.healthyCount}/${connection.total} منصات متصلة`;
}

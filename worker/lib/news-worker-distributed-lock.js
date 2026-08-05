const DEFAULT_TTL_SECONDS = 180;

let metrics = {
  distributedLockAcquired: 0,
  distributedLockContended: 0,
  distributedLockExpiredRecovered: 0,
  distributedLockErrors: 0,
};

let activeOwner = null;
let heartbeatTimer = null;

function getInstanceId() {
  return (
    process.env.RAILWAY_REPLICA_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.HOSTNAME ||
    `pid-${process.pid}`
  );
}

function getDistributedLockMetrics() {
  return { ...metrics };
}

function resetDistributedLockMetricsForTests() {
  metrics = {
    distributedLockAcquired: 0,
    distributedLockContended: 0,
    distributedLockExpiredRecovered: 0,
    distributedLockErrors: 0,
  };
  activeOwner = null;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(getSupabaseClient, ownerId, ttlSeconds, lockName = "news_worker_cycle") {
  stopHeartbeat();
  const renewEveryMs = Math.max(15_000, Math.floor((ttlSeconds * 1000) / 3));
  heartbeatTimer = setInterval(async () => {
    try {
      const client = getSupabaseClient?.();
      if (!client || !activeOwner) return;
      await client.rpc("renew_news_worker_cycle_lock", {
        p_owner_id: ownerId,
        p_ttl_seconds: ttlSeconds,
        p_lock_name: lockName,
      });
    } catch (error) {
      metrics.distributedLockErrors += 1;
      console.error("NEWS_WORKER_LOCK_HEARTBEAT_ERROR", JSON.stringify({ message: error.message }));
    }
  }, renewEveryMs);
  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }
}

async function acquireDistributedCycleLock(getSupabaseClient, options = {}) {
  const ownerId = options.ownerId || getInstanceId();
  const ttlSeconds = options.ttlSeconds || DEFAULT_TTL_SECONDS;
  const lockName = options.lockName || "news_worker_cycle";
  const client = getSupabaseClient?.();

  if (!client) {
    metrics.distributedLockErrors += 1;
    return { acquired: false, reason: "supabase_unavailable", owner: ownerId, distributed: false };
  }

  try {
    const { data, error } = await client.rpc("try_acquire_news_worker_cycle_lock", {
      p_owner_id: ownerId,
      p_ttl_seconds: ttlSeconds,
      p_lock_name: lockName,
    });

    if (error) {
      metrics.distributedLockErrors += 1;
      return { acquired: false, reason: error.message, owner: ownerId, distributed: true };
    }

    if (data?.acquired) {
      metrics.distributedLockAcquired += 1;
      if (data.recovered) {
        metrics.distributedLockExpiredRecovered += 1;
      }
      activeOwner = ownerId;
      startHeartbeat(getSupabaseClient, ownerId, ttlSeconds, lockName);
      return {
        acquired: true,
        owner: ownerId,
        lockName,
        expiresAt: data.expiresAt || null,
        recovered: Boolean(data.recovered),
        renewed: Boolean(data.renewed),
        distributed: true,
      };
    }

    metrics.distributedLockContended += 1;
    return {
      acquired: false,
      reason: data?.reason || "contended",
      owner: data?.owner || null,
      expiresAt: data?.expiresAt || null,
      distributed: true,
    };
  } catch (error) {
    metrics.distributedLockErrors += 1;
    return { acquired: false, reason: error.message, owner: ownerId, distributed: true };
  }
}

async function releaseDistributedCycleLock(getSupabaseClient, ownerId = activeOwner, lockName = "news_worker_cycle") {
  stopHeartbeat();
  const resolvedOwner = ownerId || activeOwner;
  activeOwner = null;

  const client = getSupabaseClient?.();
  if (!client || !resolvedOwner) {
    return { released: false, reason: "no_client_or_owner" };
  }

  try {
    const { data, error } = await client.rpc("release_news_worker_cycle_lock", {
      p_owner_id: resolvedOwner,
      p_lock_name: lockName,
    });
    if (error) {
      metrics.distributedLockErrors += 1;
      return { released: false, reason: error.message };
    }
    return { released: Boolean(data?.released), ...data };
  } catch (error) {
    metrics.distributedLockErrors += 1;
    return { released: false, reason: error.message };
  }
}

module.exports = {
  acquireDistributedCycleLock,
  releaseDistributedCycleLock,
  getDistributedLockMetrics,
  resetDistributedLockMetricsForTests,
  getInstanceId,
  DEFAULT_TTL_SECONDS,
};

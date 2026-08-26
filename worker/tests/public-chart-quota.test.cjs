#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createSharedQuotaStore(initial = null) {
  const { AUTHORITY_BUCKET, WINDOW_KEY } = require(path.join(
    root,
    "lib/general-rss/chart-visual-policy/public-chart-quota"
  ));
  const key = `${WINDOW_KEY}::${AUTHORITY_BUCKET}`;
  const store = new Map();
  if (initial) store.set(key, { metrics: { ...initial }, bucket_start: AUTHORITY_BUCKET });

  function buildQuery() {
    const filters = {};
    const api = {
      select() {
        return api;
      },
      eq(field, value) {
        filters[field] = value;
        return api;
      },
      maybeSingle() {
        const row = store.get(key);
        return Promise.resolve({
          data: row
            ? { metrics: { ...row.metrics }, bucket_start: row.bucket_start, created_at: row.created_at || new Date().toISOString() }
            : null,
          error: null,
        });
      },
      upsert(payload) {
        store.set(key, {
          metrics: { ...(payload.metrics || {}) },
          bucket_start: payload.bucket_start,
          created_at: new Date().toISOString(),
        });
        return Promise.resolve({ data: payload, error: null });
      },
    };
    return api;
  }

  const client = {
    from(table) {
      if (table !== "news_system_metric_snapshots") {
        throw new Error(`unexpected table ${table}`);
      }
      return buildQuery();
    },
    store,
    key,
  };

  return { client, store, key, AUTHORITY_BUCKET };
}

function installDistributedLockMock(sharedHolder = { owner: null }) {
  const lockPath = path.join(root, "lib/news-worker-distributed-lock.js");
  const original = require(lockPath);
  const mock = {
    ...original,
    acquireDistributedCycleLock: async (_getClient, options = {}) => {
      const owner = options.ownerId || "worker-a";
      if (sharedHolder.owner && sharedHolder.owner !== owner) {
        return { acquired: false, reason: "contended", distributed: true, owner, lockName: options.lockName };
      }
      sharedHolder.owner = owner;
      return { acquired: true, distributed: true, owner, lockName: options.lockName };
    },
    releaseDistributedCycleLock: async () => {
      sharedHolder.owner = null;
    },
  };
  require.cache[lockPath] = { exports: mock, id: lockPath, loaded: true, filename: lockPath };
  return () => {
    require.cache[lockPath] = { exports: original, id: lockPath, loaded: true, filename: lockPath };
  };
}

function loadQuotaModule() {
  const modulePath = path.join(root, "lib/general-rss/chart-visual-policy/public-chart-quota.js");
  delete require.cache[modulePath];
  return require(modulePath);
}

function loadChartPolicyModule() {
  const modulePath = path.join(root, "lib/general-rss/chart-visual-policy/index.js");
  delete require.cache[modulePath];
  delete require.cache[path.join(root, "lib/general-rss/chart-visual-policy/public-chart-quota.js")];
  return require(modulePath);
}

function loadClassifierModule() {
  return require(path.join(root, "lib/general-rss/chart-visual-policy/chart-classifier"));
}

function testA_AuthorityBucketValidTimestamptz() {
  const quota = loadQuotaModule();
  const parsed = Date.parse(quota.AUTHORITY_BUCKET);
  assert(!Number.isNaN(parsed), "A authority bucket is valid timestamptz");
  assert(quota.AUTHORITY_BUCKET.includes("T"), "A authority bucket is ISO timestamp");
}

async function testB_FirstAuthorityRowCreated() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  await quota.loadPublicChartQuotaState({ supabase: store.client, forceLocalAuthority: false });
  const meta = quota.getAuthorityLoadMetaForTests();
  assert(meta.rowPresent === true, "B authority row present after bootstrap");
  assert(meta.bootstrapped === true, "B authority row bootstrapped");
  assert(store.store.size === 1, "B exactly one authority row");
  restoreLock();
}

async function testC_ReloadReadsSameRow() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_000_000_000,
    skipProcessQueue: true,
  });

  quota.resetPublicChartQuotaForTests();
  const reloaded = loadQuotaModule();
  const blocked = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_000_100_000,
    skipProcessQueue: true,
  });
  assert(blocked.granted === false, "C restart reads persisted authority");
  restoreLock();
}

async function testD_OnlyOneAuthorityRow() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  await quota.loadPublicChartQuotaState({ supabase: store.client, forceLocalAuthority: false });
  await quota.loadPublicChartQuotaState({ supabase: store.client, forceLocalAuthority: false });
  assert(store.store.size === 1, "D only one authority row");
  restoreLock();
}

async function testE_SecondChartBlocked() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  const first = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  const second = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(first.granted === true, "E first granted");
  assert(second.granted === false, "E second blocked");
  restoreLock();
}

async function testF_ChartAfter24hAllowed() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const { ROLLING_WINDOW_MS } = quota;
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();
  const t0 = 1_700_300_000_000;

  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0,
    skipProcessQueue: true,
  });
  const after = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0 + ROLLING_WINDOW_MS + 60_000,
    skipProcessQueue: true,
  });
  assert(after.granted === true, "F chart after 24h allowed");
  restoreLock();
}

async function testG_ConcurrentInProcess() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  const [a, b] = await Promise.all([
    quota.tryReservePublicChartQuota({ supabase: store.client, forceLocalAuthority: false }),
    quota.tryReservePublicChartQuota({ supabase: store.client, forceLocalAuthority: false }),
  ]);
  assert([a, b].filter((r) => r.granted).length === 1, "G one concurrent grant");
  restoreLock();
}

async function testH_MultiWorkerDistributed() {
  const store = createSharedQuotaStore();
  const sharedHolder = { owner: null };
  const restoreLock = installDistributedLockMock(sharedHolder);
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();

  const a = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  const b = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(a.granted === true, "H worker A wins");
  assert(b.granted === false, "H worker B blocked");
  restoreLock();
}

async function testI_ProductionSupabaseUnavailableDenied() {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  };
  process.env.NODE_ENV = "production";
  process.env.RAILWAY_GIT_COMMIT_SHA = "testsha";
  try {
    const quota = loadQuotaModule();
    quota.resetPublicChartQuotaForTests();
    const denied = await quota.tryReservePublicChartQuota({ skipProcessQueue: true });
    assert(denied.granted === false, "I production without supabase denied");
    assert(denied.reason === "CHART_QUOTA_AUTHORITY_UNAVAILABLE", "I unavailable reason");
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.RAILWAY_GIT_COMMIT_SHA === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = previous.RAILWAY_GIT_COMMIT_SHA;
  }
}

async function testJ_ProductionNeverLocalMode() {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
  };
  process.env.NODE_ENV = "production";
  process.env.RAILWAY_GIT_COMMIT_SHA = "testsha";
  try {
    const quota = loadQuotaModule();
    quota.resetPublicChartQuotaForTests();
    const mode = quota.resolveQuotaAuthorityMode({});
    assert(mode === "unavailable", "J production never local without supabase");
    const denied = await quota.tryReservePublicChartQuota({ skipProcessQueue: true });
    assert(denied.authorityMode === "unavailable", "J authorityMode unavailable");
    assert(denied.authorityMode !== "local", "J never local in production");
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.RAILWAY_GIT_COMMIT_SHA === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = previous.RAILWAY_GIT_COMMIT_SHA;
  }
}

async function testK_TestEnvironmentLocalMode() {
  delete process.env.NODE_ENV;
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  delete process.env.RAILWAY_ENVIRONMENT;
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();
  const mode = quota.resolveQuotaAuthorityMode({ testMode: true });
  assert(mode === "local", "K testMode uses local");
  const granted = await quota.tryReservePublicChartQuota({ testMode: true, skipProcessQueue: true });
  assert(granted.granted === true, `K local test grant works: ${JSON.stringify(granted)}`);
  assert(granted.authorityMode === "local", "K granted authorityMode local");
}

async function testL_AdminReadModelSchemaContract() {
  const { buildChartVisualPolicyReadModel } = await import(
    "file:///Users/hasanelhut/Desktop/hasan-chart-website/lib/news-system-status/read-model.js"
  );
  const recent = new Date(Date.now() - 60_000).toISOString();
  const model = buildChartVisualPolicyReadModel(
    {
      snapshot: {
        metrics: {
          lastChartPublishedAt: recent,
          chartRolling24hCount: 1,
          authorityHealthy: true,
          authorityMode: "distributed",
          chartQuotaChecked: 2,
          chartQuotaGranted: 1,
          chartQuotaBlocked: 1,
        },
        created_at: recent,
      },
      queryFailed: false,
      rowMissing: false,
      error: null,
    },
    null
  );
  assert(model.quotaStatus === "exhausted", "L read-model exhausted");
  assert(model.authorityUpdatedAt === recent, "L uses created_at not updated_at");
  assert(model.authorityQueryFailed === false, "L no query failure flag");
}

async function testM_MissingRowDoesNotCrashReadModel() {
  const { buildChartVisualPolicyReadModel } = await import(
    "file:///Users/hasanelhut/Desktop/hasan-chart-website/lib/news-system-status/read-model.js"
  );
  const model = buildChartVisualPolicyReadModel(
    { snapshot: null, queryFailed: false, rowMissing: true, error: null },
    null
  );
  assert(model.quotaStatus === "authority_missing", "M missing row status");
  assert(model.authorityHealthy === false, "M missing row unhealthy");
}

async function testN_QueryFailureUnhealthy() {
  const { buildChartVisualPolicyReadModel } = await import(
    "file:///Users/hasanelhut/Desktop/hasan-chart-website/lib/news-system-status/read-model.js"
  );
  const model = buildChartVisualPolicyReadModel(
    { snapshot: null, queryFailed: true, rowMissing: false, error: "db down" },
    null
  );
  assert(model.authorityHealthy === false, "N query failure unhealthy");
  assert(model.authorityQueryFailed === true, "N query failure flagged");
}

async function testO_HeartbeatCannotOverridePersistentAuthority() {
  delete process.env.NODE_ENV;
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  delete process.env.RAILWAY_ENVIRONMENT;
  const restoreLock = installDistributedLockMock({ owner: null });
  loadQuotaModule();
  const chartPolicy = loadChartPolicyModule();
  const store = createSharedQuotaStore();
  const t0 = Date.now();

  const reserved = await chartPolicy.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0,
    skipProcessQueue: true,
  });
  assert(reserved.granted === true, "O chart reserved in authority");
  const persisted = store.store.get(store.key);
  assert(persisted?.metrics?.lastChartPublishedAt, "O authority row persisted chart timestamp");

  const heartbeatPolicy = {
    quotaStatus: "available",
    lastChartPublishedAt: null,
    authorityHealthy: true,
    authorityMode: "local",
  };
  const authority = await chartPolicy.getChartPolicyTelemetrySnapshotFromAuthority({
    supabase: store.client,
    forceLocalAuthority: false,
  });
  assert(authority.lastChartPublishedAt, "O authority has persisted chart time");
  assert(authority.quotaStatus === "exhausted", `O authority exhausted: ${JSON.stringify(authority)}`);
  assert(authority.authorityMode === "distributed", "O authority mode from persistence");
  assert(heartbeatPolicy.quotaStatus !== authority.quotaStatus, "O heartbeat differs from authority");
  restoreLock();
}

function testP_OrdinaryPhotoNoQuota() {
  const { classifyImageVisualType, consumesPublicChartQuota } = loadClassifierModule();
  const photo = classifyImageVisualType("https://cdn.example.com/hero-photo.jpg", { title: "Earnings beat" });
  assert(consumesPublicChartQuota(photo) === false, "P ordinary photo");
}

function testQ_GeneratedCardNoQuota() {
  const { classifyImageVisualType, consumesPublicChartQuota, VISUAL_TYPES } = loadClassifierModule();
  const card = classifyImageVisualType("/tmp/card.png", { isGeneratedNewsCard: true });
  assert(card === VISUAL_TYPES.GENERATED_CARD, "Q generated card");
  assert(consumesPublicChartQuota(card) === false, "Q no quota");
}

async function testR_BlockedChartTextFallback() {
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();
  await quota.tryReservePublicChartQuota({ testMode: true, skipProcessQueue: true });
  const blocked = await quota.tryReservePublicChartQuota({ testMode: true, skipProcessQueue: true });
  assert(blocked.granted === false, "R blocked");
  quota.recordChartQuotaTextFallback();
  const snap = quota.getPublicChartQuotaTelemetrySnapshot({ testMode: true });
  assert(snap.chartFallbackTextOnly >= 1, "R text fallback counted");
}

async function testS_RestartCannotResetQuota() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();
  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  quota.resetPublicChartQuotaForTests();
  const reloaded = loadQuotaModule();
  const blocked = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(blocked.granted === false, "S restart cannot reset quota");
  restoreLock();
}

async function testT_BootstrapNoSecondChartLoophole() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  await quota.loadPublicChartQuotaState({ supabase: store.client, forceLocalAuthority: false });
  store.store.get(store.key).metrics.lastChartPublishedAt = new Date(Date.now() - 60_000).toISOString();
  store.store.get(store.key).metrics.chartRolling24hCount = 1;

  quota.resetPublicChartQuotaForTests();
  const reloaded = loadQuotaModule();
  const blocked = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(blocked.granted === false, "T bootstrap cannot bypass existing window");
  restoreLock();
}

async function runRssPathTest() {
  delete process.env.NODE_ENV;
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  const restoreLock = installDistributedLockMock({ owner: null });
  const chartPolicy = loadChartPolicyModule();
  const store = createSharedQuotaStore();

  const firstReserve = await chartPolicy.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  const secondReserve = await chartPolicy.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(firstReserve.granted === true, "RSS path first chart reservation");
  assert(secondReserve.granted === false, `RSS authority blocks second chart reservation: ${JSON.stringify(secondReserve)}`);
  restoreLock();
}

async function main() {
  testA_AuthorityBucketValidTimestamptz();
  await testB_FirstAuthorityRowCreated();
  await testC_ReloadReadsSameRow();
  await testD_OnlyOneAuthorityRow();
  await testE_SecondChartBlocked();
  await testF_ChartAfter24hAllowed();
  await testG_ConcurrentInProcess();
  await testH_MultiWorkerDistributed();
  await testI_ProductionSupabaseUnavailableDenied();
  await testJ_ProductionNeverLocalMode();
  await testK_TestEnvironmentLocalMode();
  await testL_AdminReadModelSchemaContract();
  await testM_MissingRowDoesNotCrashReadModel();
  await testN_QueryFailureUnhealthy();
  await testO_HeartbeatCannotOverridePersistentAuthority();
  testP_OrdinaryPhotoNoQuota();
  testQ_GeneratedCardNoQuota();
  await testR_BlockedChartTextFallback();
  await testS_RestartCannotResetQuota();
  await testT_BootstrapNoSecondChartLoophole();
  await runRssPathTest();
  console.log("public-chart-quota.test.cjs: all passed (A-T)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

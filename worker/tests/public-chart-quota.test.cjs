#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createSharedQuotaStore(initial = null) {
  const key = "public_chart_quota::authority";
  const store = new Map();
  if (initial) store.set(key, { metrics: { ...initial } });

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
        return Promise.resolve({ data: row ? { metrics: { ...row.metrics } } : null, error: null });
      },
      upsert(payload) {
        store.set(key, { metrics: { ...(payload.metrics || {}) } });
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
  };

  return { client, store, key };
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
  return require(modulePath);
}

function loadClassifierModule() {
  return require(path.join(root, "lib/general-rss/chart-visual-policy/chart-classifier"));
}

async function runCoreQuotaTests() {
  const restoreLock = installDistributedLockMock({ owner: null });
  const quota = loadQuotaModule();
  const { ROLLING_WINDOW_MS } = quota;
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  // A. First chart allowed
  const first = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_000_000_000,
    skipProcessQueue: true,
  });
  assert(first.granted === true, "A first chart granted");

  // B. Second chart same source blocked
  const secondSameSource = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_000_100_000,
    skipProcessQueue: true,
  });
  assert(secondSameSource.granted === false, "B second same source blocked");

  quota.resetPublicChartQuotaForTests();
  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_100_000_000,
    skipProcessQueue: true,
  });

  // C. Different source blocked
  const differentSource = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_100_100_000,
    skipProcessQueue: true,
  });
  assert(differentSource.granted === false, "C different source blocked");

  quota.resetPublicChartQuotaForTests();
  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_200_000_000,
    skipProcessQueue: true,
  });

  // D. Different symbol blocked
  const differentSymbol = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_200_100_000,
    skipProcessQueue: true,
  });
  assert(differentSymbol.granted === false, "D different symbol blocked");

  // E. Restart simulation — memory cleared, authority row persists
  quota.resetPublicChartQuotaForTests();
  const reloaded = loadQuotaModule();
  const afterRestart = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: 1_700_200_100_000,
    skipProcessQueue: true,
  });
  assert(afterRestart.granted === false, "E restart still blocked from persistence");

  // F. Rolling expiry
  reloaded.resetPublicChartQuotaForTests();
  const t0 = 1_700_300_000_000;
  await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0,
    skipProcessQueue: true,
  });
  const beforeExpiry = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0 + ROLLING_WINDOW_MS - 60_000,
    skipProcessQueue: true,
  });
  assert(beforeExpiry.granted === false, "F blocked at T0+23h59m");
  reloaded.resetPublicChartQuotaForTests();
  await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0,
    skipProcessQueue: true,
  });
  const afterExpiry = await reloaded.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    nowMs: t0 + ROLLING_WINDOW_MS + 60_000,
    skipProcessQueue: true,
  });
  assert(afterExpiry.granted === true, "F allowed at T0+24h01m");
  restoreLock();
}

async function runConcurrentReservationTest() {
  const quota = loadQuotaModule();
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();
  const restoreLock = installDistributedLockMock({ owner: null });

  const [a, b] = await Promise.all([
    quota.tryReservePublicChartQuota({ supabase: store.client, forceLocalAuthority: false }),
    quota.tryReservePublicChartQuota({ supabase: store.client, forceLocalAuthority: false }),
  ]);
  const granted = [a, b].filter((r) => r.granted);
  assert(granted.length === 1, "G exactly one concurrent grant");
  assert([a, b].some((r) => r.granted === false), "G exactly one concurrent block");
  restoreLock();
}

async function runDistributedMultiWorkerTest() {
  const store = createSharedQuotaStore();
  const sharedHolder = { owner: null };
  const restoreLock = installDistributedLockMock(sharedHolder);
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();

  const workerA = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    ownerId: "worker-a",
    skipProcessQueue: true,
  });
  assert(workerA.granted === true, "H worker A wins");

  const workerB = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    ownerId: "worker-b",
    skipProcessQueue: true,
  });
  assert(workerB.granted === false, "H worker B blocked by shared authority");
  restoreLock();
}

function runClassificationTests() {
  const { classifyImageVisualType, consumesPublicChartQuota, VISUAL_TYPES } = loadClassifierModule();

  // I. Ordinary photo does not consume quota
  const photoType = classifyImageVisualType("https://cdn.example.com/hero-photo.jpg", {
    title: "Company reports earnings beat",
  });
  assert(consumesPublicChartQuota(photoType) === false, "I ordinary photo no quota");

  // J. Generated economic card does not consume unless chart-classified
  const generated = classifyImageVisualType("/tmp/news-card.png", { isGeneratedNewsCard: true });
  assert(generated === VISUAL_TYPES.GENERATED_CARD, "J generated card type");
  assert(consumesPublicChartQuota(generated) === false, "J generated card no quota");

  const generatedAsChart = classifyImageVisualType("/tmp/news-card.png", {
    isGeneratedNewsCard: true,
    title: "USD/JPY price chart breakout",
  });
  assert(generatedAsChart === VISUAL_TYPES.GENERATED_CARD, "J generated card stays non-chart by default");
  assert(consumesPublicChartQuota(generatedAsChart) === false, "J generated card no quota even with chart title");
}

async function runRssPathTest() {
  loadQuotaModule();
  const chartPolicy = loadChartPolicyModule();
  const quota = require(path.join(root, "lib/general-rss/chart-visual-policy/public-chart-quota"));
  const store = createSharedQuotaStore();
  quota.resetPublicChartQuotaForTests();

  const chartItem = {
    title: "USD/JPY price chart update",
    contentSnippet: "Technical chart shows resistance",
    enclosure: { url: "https://cdn.example.com/stock-chart/usdjpy.png" },
  };

  const first = await chartPolicy.resolveRssSourceImageWithChartPolicy({
    source: "reuters",
    item: chartItem,
    articleUrl: "https://example.com/usdjpy",
    chartPolicy: { supabase: store.client, testMode: true },
    skipValidation: true,
  });
  assert(first?.url, "L RSS first chart resolved");

  const second = await chartPolicy.resolveRssSourceImageWithChartPolicy({
    source: "bloomberg",
    item: {
      ...chartItem,
      enclosure: { url: "https://cdn.example.com/stock-chart/eurusd.png" },
    },
    articleUrl: "https://example.com/eurusd",
    chartPolicy: { supabase: store.client, testMode: true },
    skipValidation: true,
  });
  assert(second === null, "L RSS second chart blocked with text-only fallback path");
}

async function runCreateNewsCardPathTest() {
  const quota = loadQuotaModule();
  const { classifyImageVisualType, consumesPublicChartQuota } = loadClassifierModule();
  quota.resetPublicChartQuotaForTests();

  const cardVisual = classifyImageVisualType("/tmp/card.png", {
    isGeneratedNewsCard: true,
    imageTitle: "Fed decision summary",
  });
  assert(consumesPublicChartQuota(cardVisual) === false, "K createNewsCard default no quota");

  const chartVisual = classifyImageVisualType("/tmp/card.png", {
    visualType: "CHART",
    imageTitle: "WTI crude chart",
  });
  assert(consumesPublicChartQuota(chartVisual) === true, "K explicit chart visual consumes quota");

  const store = createSharedQuotaStore();
  await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  const blocked = await quota.tryReservePublicChartQuota({
    supabase: store.client,
    forceLocalAuthority: false,
    skipProcessQueue: true,
  });
  assert(blocked.granted === false, "K chart path respects global authority");
}

async function runScheduledAlertPathTest() {
  const { classifyImageVisualType, consumesPublicChartQuota, VISUAL_TYPES } = loadClassifierModule();
  const alertVisual = classifyImageVisualType("/tmp/alert-card.png", {
    isGeneratedNewsCard: true,
    imageTitle: "Market open levels",
    contextText: "Session outlook",
  });
  assert(alertVisual === VISUAL_TYPES.GENERATED_CARD, "M scheduled alert generated card");
  assert(consumesPublicChartQuota(alertVisual) === false, "M scheduled alert card no quota by default");
}

async function runBlockedFallbackTest() {
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();

  let textFallbackCount = 0;
  const original = quota.recordChartQuotaTextFallback;
  quota.recordChartQuotaTextFallback = () => {
    textFallbackCount += 1;
  };

  await quota.tryReservePublicChartQuota({ skipProcessQueue: true, testMode: true });
  const blocked = await quota.tryReservePublicChartQuota({ skipProcessQueue: true, testMode: true });
  assert(blocked.granted === false, "N second chart blocked");

  quota.recordChartQuotaTextFallback();
  assert(textFallbackCount === 1, "N text fallback recorded on block");

  quota.recordChartQuotaTextFallback = original;
}

async function runProductionFailSafeTest() {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const quota = loadQuotaModule();
    quota.resetPublicChartQuotaForTests();
    const denied = await quota.tryReservePublicChartQuota({
      skipProcessQueue: true,
      nowMs: Date.now(),
    });
    assert(denied.granted === false, "production without supabase denies chart grant");
    assert(
      denied.reason === "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
      "production fail-safe reason"
    );
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
}

async function runReadModelShapeTest() {
  const quota = loadQuotaModule();
  quota.resetPublicChartQuotaForTests();
  const model = quota.buildPublicChartQuotaReadModel(
    { lastChartPublishedAt: new Date().toISOString(), chartRolling24hCount: 1 },
    { testMode: true }
  );
  assert(model.quotaStatus === "exhausted", "read-model exhausted status");
  assert(typeof model.nextChartEligibleAt === "string", "read-model next eligible");
  assert(model.sourceOfTruth.includes("public_chart_quota"), "read-model source of truth");
}

async function main() {
  await runCoreQuotaTests();
  await runConcurrentReservationTest();
  await runDistributedMultiWorkerTest();
  runClassificationTests();
  await runRssPathTest();
  await runCreateNewsCardPathTest();
  await runScheduledAlertPathTest();
  await runBlockedFallbackTest();
  await runProductionFailSafeTest();
  await runReadModelShapeTest();
  console.log("public-chart-quota.test.cjs: all passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

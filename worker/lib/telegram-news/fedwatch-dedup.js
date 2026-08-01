function parseProbability(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function parseBasisPoints(text) {
  const match = String(text || "").match(/(\d+)\s*(?:نقطة|نقاط|bp|bps|basis\s*points?)/i);
  return match ? Number(match[1]) : null;
}

function parseMeetingBucket(text) {
  const value = String(text || "").toLowerCase();
  const monthMatch = value.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نovember|نوفمبر|ديسمبر)\b/i
  );
  if (monthMatch) {
    return monthMatch[1].toLowerCase();
  }
  if (/fomc|fed meeting|اجتماع الفيدرالي|قرار الفائدة/i.test(value)) {
    return "fomc-next";
  }
  return "unknown";
}

function detectFedWatchScenario(text) {
  const value = String(text || "").toLowerCase();
  if (/رفع|hike|raise|25\s*(?:bp|نقطة)/i.test(value)) {
    return "hike";
  }
  if (/خفض|cut|lower/i.test(value)) {
    return "cut";
  }
  if (/تثبيت|hold|unchanged|no change/i.test(value)) {
    return "hold";
  }
  return "mixed";
}

function isFedWatchSource(text) {
  const value = String(text || "").toLowerCase();
  if (/fedwatch|تسعير\s*fed/i.test(value)) {
    return true;
  }
  return /%/.test(value) && /(fomc|fedwatch|probability|احتمال|25\s*(?:bp|نقطة)|50\s*(?:bp|نقطة)|75\s*(?:bp|نقطة)|basis\s*points?)/i.test(value);
}

function buildFedWatchFingerprint(text, facts = {}) {
  const source = `${text || ""} ${facts.title || ""} ${(facts.detailLines || []).join(" ")}`;
  if (!isFedWatchSource(source)) {
    return null;
  }

  const meeting = parseMeetingBucket(source);
  const scenario = detectFedWatchScenario(source);
  const probability = parseProbability(source);
  const basisPoints = parseBasisPoints(source);
  const previousProbabilityMatch = source.match(/(?:مقابل|from|vs|against|أمس|previous)\s*(\d+(?:\.\d+)?)\s*%/i);
  const previousProbability = previousProbabilityMatch ? Number(previousProbabilityMatch[1]) : null;
  const bucket = facts.sourcePublishedAt
    ? new Date(facts.sourcePublishedAt).toISOString().slice(0, 13)
    : "unknown-hour";

  return {
    key: ["fedwatch", meeting, scenario, basisPoints || "na", probability ?? "na", previousProbability ?? "na"].join("|"),
    meeting,
    scenario,
    probability,
    previousProbability,
    basisPoints,
    bucket,
  };
}

function compareFedWatchUpdates(olderItem, newerItem) {
  const olderFp = buildFedWatchFingerprint(olderItem.post?.rawText, olderItem.facts);
  const newerFp = buildFedWatchFingerprint(newerItem.post?.rawText, newerItem.facts);
  if (!olderFp || !newerFp || olderFp.meeting !== newerFp.meeting) {
    return { action: "none" };
  }

  const olderProb = olderFp.probability;
  const newerProb = newerFp.probability;
  if (olderProb !== null && newerProb !== null) {
    const delta = Math.abs(newerProb - olderProb);
    if (delta < 0.01) {
      return { action: "duplicate_skip", delta };
    }
    if (delta < 5 && newerFp.scenario === olderFp.scenario) {
      return { action: "duplicate_skip", delta };
    }
    if (delta >= 5 || newerFp.scenario !== olderFp.scenario) {
      return { action: "update_pending", delta, reason: "material_probability_change" };
    }
  }

  return { action: "duplicate_skip" };
}

function applyFedWatchDedup(processedItems = []) {
  const grouped = new Map();

  for (const item of processedItems) {
    const fp = buildFedWatchFingerprint(item.post?.rawText, item.facts);
    if (!fp) {
      continue;
    }
    const list = grouped.get(fp.meeting) || [];
    list.push({ item, fp });
    grouped.set(fp.meeting, list);
  }

  for (const entries of grouped.values()) {
    if (entries.length < 2) {
      continue;
    }

    entries.sort(
      (a, b) =>
        new Date(b.item.post?.sourcePublishedAt || 0).getTime() -
        new Date(a.item.post?.sourcePublishedAt || 0).getTime()
    );

    const winner = entries[0];
    for (let index = 1; index < entries.length; index += 1) {
      const comparison = compareFedWatchUpdates(entries[index].item, winner.item);
      if (comparison.action === "duplicate_skip") {
        entries[index].item.skipPublish = true;
        entries[index].item.reason = "fedwatch_duplicate_skip";
      } else if (comparison.action === "update_pending") {
        entries[index].item.skipPublish = true;
        winner.item.skipPublish = true;
        winner.item.reason = "TELEGRAM_NEWS_UPDATE_PENDING";
        entries[index].item.reason = "TELEGRAM_NEWS_UPDATE_PENDING";
      }
    }
  }

  return processedItems;
}

module.exports = {
  buildFedWatchFingerprint,
  compareFedWatchUpdates,
  applyFedWatchDedup,
  isFedWatchSource,
};

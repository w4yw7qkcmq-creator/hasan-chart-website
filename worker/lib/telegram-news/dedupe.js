const { buildFingerprintBundle } = require("./fingerprint");
const { extractFactsFromTelegramPost } = require("./extractor");
const { detectFactConflict } = require("./conflict");
const { formatTelegramPost } = require("./format");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { getMergeWindowMs } = require("./merge-window");
const { prepareTelegramPost } = require("./pipeline");

function scorePostCompleteness(facts) {
  let score = 0;
  if (facts.title) score += 2;
  if (facts.previous || facts.revisedPrevious) score += 2;
  if (facts.forecast) score += 2;
  if (facts.actual) score += 3;
  if (facts.detailLines?.length) score += facts.detailLines.length;
  return score;
}

function mergeFacts(primary, secondary) {
  const bestTitle = [primary.title, secondary.title]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];

  return {
    ...primary,
    title: bestTitle || primary.title || secondary.title,
    country: primary.country || secondary.country,
    previous: primary.previous || secondary.previous,
    forecast: primary.forecast || secondary.forecast,
    actual: primary.actual || secondary.actual,
    revisedPrevious: primary.revisedPrevious || secondary.revisedPrevious,
    detailLines: [...new Set([...(primary.detailLines || []), ...(secondary.detailLines || [])])],
    numbers: [...new Set([...(primary.numbers || []), ...(secondary.numbers || [])])],
    rawNumbers: [...new Set([...(primary.rawNumbers || []), ...(secondary.numbers || [])])],
    entities: [...new Set([...(primary.entities || []), ...(secondary.entities || [])])],
    factualSummary: primary.factualSummary || secondary.factualSummary,
  };
}

function buildSourceMetadata(entries) {
  const now = new Date().toISOString();
  const sourceChannels = [...new Set(entries.map((entry) => entry.post.sourceChannel))];
  const sourceMessageIds = entries.map((entry) => ({
    channel: entry.post.sourceChannel,
    messageId: entry.post.sourceMessageId,
  }));
  const sourceUrls = entries.map((entry) => entry.post.sourceUrl).filter(Boolean);
  const firstSeenAt = entries
    .map((entry) => entry.post.sourcePublishedAt)
    .sort()[0];
  const lastSeenAt = entries
    .map((entry) => entry.post.sourcePublishedAt)
    .sort()
    .slice(-1)[0];

  return {
    sourceChannels,
    sourceMessageIds,
    sourceUrls,
    firstSeenAt: firstSeenAt || now,
    lastSeenAt: lastSeenAt || now,
    mergedSources: sourceChannels,
  };
}

function pickWinnerPost(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      const scoreDelta = scorePostCompleteness(b.facts) - scorePostCompleteness(a.facts);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return (a.post.priority || 99) - (b.post.priority || 99);
    })[0];
}

function dedupeGroupEntries(entries) {
  if (!entries.length) {
    return null;
  }

  if (entries.length === 1) {
    const entry = entries[0];
    const metadata = buildSourceMetadata(entries);
    return {
      post: entry.post,
      facts: entry.facts,
      fingerprints: entry.fingerprints,
      mergeKey: entry.fingerprints.mergeKey,
      sources: metadata.sourceChannels,
      mergedFrom: [],
      conflict: { hasConflict: false, conflicts: [] },
      duplicateOf: null,
      metadata,
      action: entry.facts.isStructuredTriple && !entry.facts.actual ? "pending" : "selected",
    };
  }

  let mergedFacts = entries[0].facts;
  let conflict = { hasConflict: false, conflicts: [] };

  for (let index = 1; index < entries.length; index += 1) {
    const nextConflict = detectFactConflict(mergedFacts, entries[index].facts);
    if (nextConflict.hasConflict) {
      conflict = nextConflict;
      break;
    }
    mergedFacts = mergeFacts(mergedFacts, entries[index].facts);
  }

  const winner = pickWinnerPost(entries);
  const metadata = buildSourceMetadata(entries);

  return {
    post: winner.post,
    facts: mergedFacts,
    fingerprints: winner.fingerprints,
    mergeKey: winner.fingerprints.mergeKey,
    sources: metadata.sourceChannels,
    mergedFrom: metadata.sourceChannels.filter((channel) => channel !== winner.post.sourceChannel),
    conflict,
    duplicateOf: entries[0].fingerprints.mergeKey,
    metadata,
    action: conflict.hasConflict ? "skipped_conflict" : metadata.mergedSources.length > 1 ? "merged" : "selected",
  };
}

function withinMergeWindow(entryA, entryB) {
  const delta = Math.abs(
    new Date(entryA.post.sourcePublishedAt).getTime() - new Date(entryB.post.sourcePublishedAt).getTime()
  );
  return delta <= Math.max(getMergeWindowMs(entryA.facts), getMergeWindowMs(entryB.facts));
}

function shouldMergeEntries(anchor, entry) {
  if (anchor.fingerprints.exact === entry.fingerprints.exact) {
    return true;
  }

  if (anchor.fingerprints.semantic === entry.fingerprints.semantic) {
    return true;
  }

  const anchorTriple = anchor.fingerprints.economicTriple;
  const entryTriple = entry.fingerprints.economicTriple;
  if (anchorTriple && entryTriple && anchorTriple === entryTriple) {
    return true;
  }

  const anchorEconomic = anchor.fingerprints.economicMerge;
  const entryEconomic = entry.fingerprints.economicMerge;
  if (anchorEconomic && entryEconomic && anchorEconomic === entryEconomic && withinMergeWindow(anchor, entry)) {
    return true;
  }

  return false;
}

function dedupeTelegramPosts(posts) {
  const exactSeen = new Map();
  const uniqueEntries = [];

  for (const post of posts) {
    const exactKey = `${post.sourceChannel}:${post.sourceMessageId}`;
    if (exactSeen.has(exactKey)) {
      continue;
    }
    exactSeen.set(exactKey, true);

    const facts = extractFactsFromTelegramPost(post);
    const fingerprints = buildFingerprintBundle(post, facts);
    uniqueEntries.push({ post, facts, fingerprints });
  }

  const groups = [];
  for (const entry of uniqueEntries) {
    let matchedGroup = null;

    for (const group of groups) {
      const anchor = group[0];
      if (shouldMergeEntries(anchor, entry)) {
        matchedGroup = group;
        break;
      }
    }

    if (!matchedGroup) {
      groups.push([entry]);
    } else {
      matchedGroup.push(entry);
    }
  }

  return groups.map((group) => dedupeGroupEntries(group)).filter(Boolean);
}

async function processTelegramPosts(posts, options = {}) {
  const pipelineStats = options.pipelineStats || options.parseStats || {};
  const preparedByKey = new Map();
  const skippedEntries = [];

  for (const post of posts) {
    const prep = prepareTelegramPost(post, pipelineStats);
    const exactKey = `${post.sourceChannel}:${post.sourceMessageId}`;
    if (prep.skip) {
      skippedEntries.push({ post, prep });
      continue;
    }
    preparedByKey.set(exactKey, prep);
  }

  const deduped = dedupeTelegramPosts([...preparedByKey.values()].map((entry) => entry.post));
  const processed = [];

  for (const { post, prep } of skippedEntries) {
    processed.push({
      post: { ...post, promoFooterRemoved: prep.promoFooterRemoved === true },
      facts: prep.classification?.facts || extractFactsFromTelegramPost(post),
      fingerprints: buildFingerprintBundle(post, prep.classification?.facts || extractFactsFromTelegramPost(post)),
      formattedMessage: null,
      skipPublish: true,
      validation: { complete: false, reason: prep.reason },
      reason: prep.reason,
      classification: prep.classification,
      newsValue: prep.newsValue,
      promoFooterRemoved: prep.promoFooterRemoved === true,
      missingFields: [],
      newsType: prep.classification?.classification === "pre_event_alert" ? "pre_event" : prep.classification?.facts?.isStructuredTriple ? "economic" : "general",
      finalFactCheck: { ok: false, reason: prep.reason },
      aiImpactUsed: false,
      aiResult: "none",
      action: "skipped_pipeline",
    });
  }

  for (const item of deduped) {
    const winnerKey = `${item.post.sourceChannel}:${item.post.sourceMessageId}`;
    const prep = preparedByKey.get(winnerKey);
    const classification = prep?.classification || {};

    if (item.conflict?.hasConflict) {
      processed.push({
        ...item,
        formattedMessage: null,
        skipPublish: true,
        validation: { complete: false, reason: "source_conflict" },
        reason: "source_conflict",
        classification,
        newsValue: prep?.newsValue,
        promoFooterRemoved: prep?.promoFooterRemoved === true,
        missingFields: item.conflict.conflicts.map((entry) => entry.field),
        newsType: item.facts.isStructuredTriple ? "economic" : classification.classification === "pre_event_alert" ? "pre_event" : "general",
        finalFactCheck: { ok: false, reason: "source_conflict" },
        aiImpactUsed: false,
        aiResult: "none",
      });
      continue;
    }

    const formatted = await formatTelegramPost(item.post, item.facts, { ...options, classification });
    const finalFactCheck =
      formatted.formatted && !formatted.skipPublish
        ? validateFinalMessageAgainstFacts(formatted.formatted, item.facts)
        : { ok: !formatted.formatted ? true : false, reason: formatted.reason };

    if (finalFactCheck.ok === false && formatted.formatted) {
      processed.push({
        ...item,
        formattedMessage: formatted.fixedTemplate || null,
        skipPublish: true,
        validation: formatted.validation,
        reason: finalFactCheck.reason || "FINAL_MESSAGE_FACT_MISMATCH",
        missingFields: formatted.missingFields || [],
        newsType: item.facts.isStructuredTriple ? "economic" : "general",
        finalFactCheck,
        aiImpactUsed: formatted.aiImpactUsed === true,
        aiResult: formatted.aiResult || "fallback",
        usedFixedTemplate: Boolean(formatted.fixedTemplate),
      });
      continue;
    }

    processed.push({
      ...item,
      fingerprint: item.fingerprints?.mergeKey || item.fingerprints?.semantic,
      formattedMessage: formatted.formatted,
      skipPublish: formatted.skipPublish,
      validation: formatted.validation,
      reason: formatted.skipPublish ? formatted.reason : item.action === "merged" ? "publish-ready-merged" : "publish-ready",
      missingFields: formatted.missingFields || [],
      newsType: item.facts.isStructuredTriple ? "economic" : classification.classification === "pre_event_alert" ? "pre_event" : "general",
      classification,
      newsValue: prep?.newsValue,
      promoFooterRemoved: prep?.promoFooterRemoved === true,
      editorialCheck: formatted.editorialCheck,
      finalFactCheck: finalFactCheck.ok === false ? finalFactCheck : { ok: true },
      aiImpactUsed: formatted.aiImpactUsed === true,
      aiResult: formatted.aiResult || "fallback",
      usedFixedTemplate: formatted.usedFixedTemplate === true,
    });
  }

  return processed;
}

module.exports = {
  dedupeTelegramPosts,
  processTelegramPosts,
  mergeFacts,
  scorePostCompleteness,
  buildSourceMetadata,
  dedupeGroupEntries,
  shouldMergeEntries,
};

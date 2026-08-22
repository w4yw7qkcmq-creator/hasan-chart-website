/** Client-safe helpers mirroring server campaign audience stats. */

export function getAudienceStatsFromCampaign(campaign, prepareStats = null) {
  if (prepareStats && typeof prepareStats === "object") {
    return {
      eligible: Number(prepareStats.eligible) || 0,
      excluded: Number(prepareStats.excluded) || 0,
      initial: Number(prepareStats.initial) || 0,
    };
  }

  const fromMeta = campaign?.metadata?.audienceStats;
  if (fromMeta && typeof fromMeta === "object") {
    return {
      eligible: Number(fromMeta.eligible) || 0,
      excluded: Number(fromMeta.excluded) || 0,
      initial: Number(fromMeta.initial) || 0,
    };
  }

  const eligible = Number(campaign?.eligible_count) || 0;
  const initial = Number(campaign?.audience_snapshot_count) || 0;
  return {
    eligible,
    excluded: Math.max(0, initial - eligible),
    initial,
  };
}

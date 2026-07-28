/**
 * @param {{
 *   lifetimeSeconds: number,
 *   appearanceCount: number,
 *   averageSize: number,
 *   maxSize: number,
 *   survivedSnapshots: number,
 *   reappearCount: number,
 * }} input
 * @returns {number}
 */
export function computePersistenceScore(input) {
  const lifetimeSeconds = Math.max(0, Number(input.lifetimeSeconds) || 0);
  const appearanceCount = Math.max(0, Number(input.appearanceCount) || 0);
  const averageSize = Math.max(0, Number(input.averageSize) || 0);
  const maxSize = Math.max(0, Number(input.maxSize) || 0);
  const survivedSnapshots = Math.max(0, Number(input.survivedSnapshots) || 0);
  const reappearCount = Math.max(0, Number(input.reappearCount) || 0);

  const lifetimeScore = Math.min(40, (lifetimeSeconds / 3600) * 40);
  const stabilityScore = Math.min(25, survivedSnapshots * 2.5);
  const sizeRatio = maxSize > 0 ? averageSize / maxSize : 0;
  const sizeScore = Math.min(20, sizeRatio * 20);
  const reappearScore = Math.min(15, reappearCount * 5);
  const appearanceScore = Math.min(10, appearanceCount);

  const total = lifetimeScore + stabilityScore + sizeScore + reappearScore + appearanceScore;
  return Math.round(Math.min(100, Math.max(0, total)) * 100) / 100;
}

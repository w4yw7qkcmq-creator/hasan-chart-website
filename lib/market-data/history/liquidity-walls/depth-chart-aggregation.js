/**
 * Aggregate historical liquidity walls into depth-chart bars grouped by price + side.
 *
 * @param {Array<{
 *   side: "bid"|"ask",
 *   price: number,
 *   notional?: number,
 *   strongestNotional?: number,
 *   persistenceScore?: number,
 *   exchange?: string,
 *   lastSeen?: number,
 * }>} walls
 * @returns {Array<{
 *   side: "bid"|"ask",
 *   price: number,
 *   notional: number,
 *   persistenceScore: number,
 *   exchangeCount: number,
 *   exchanges: string[],
 *   lastSeen: number,
 * }>}
 */
export function aggregateWallsForDepthChart(walls = []) {
  /** @type {Map<string, { side: "bid"|"ask", price: number, notional: number, persistenceScore: number, exchanges: Set<string>, lastSeen: number }>} */
  const grouped = new Map();

  for (const wall of walls) {
    if (!wall || !Number.isFinite(wall.price)) continue;
    const side = wall.side === "ask" ? "ask" : "bid";
    const key = `${side}:${wall.price}`;
    const notional = Number(wall.strongestNotional ?? wall.notional) || 0;
    const existing = grouped.get(key) || {
      side,
      price: wall.price,
      notional: 0,
      persistenceScore: 0,
      exchanges: new Set(),
      lastSeen: 0,
    };

    existing.notional += notional;
    existing.persistenceScore = Math.max(existing.persistenceScore, Number(wall.persistenceScore) || 0);
    if (wall.exchange) existing.exchanges.add(wall.exchange);
    existing.lastSeen = Math.max(existing.lastSeen, Number(wall.lastSeen) || 0);
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .map((entry) => ({
      side: entry.side,
      price: entry.price,
      notional: entry.notional,
      persistenceScore: entry.persistenceScore,
      exchangeCount: entry.exchanges.size,
      exchanges: [...entry.exchanges],
      lastSeen: entry.lastSeen,
    }))
    .sort((a, b) => a.price - b.price);
}

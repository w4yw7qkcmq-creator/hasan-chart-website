const { roundPrice } = require("./utils");

function computePremiumDiscount({ swingHigh, swingLow, currentPrice }) {
  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) {
    return {
      premiumDiscount: "equilibrium",
      equilibrium: currentPrice,
      rangeFrom: null,
      rangeTo: null,
    };
  }

  const equilibrium = roundPrice((swingHigh + swingLow) / 2);
  let premiumDiscount = "equilibrium";

  if (currentPrice > equilibrium + (swingHigh - swingLow) * 0.1) premiumDiscount = "premium";
  else if (currentPrice < equilibrium - (swingHigh - swingLow) * 0.1) premiumDiscount = "discount";

  return {
    premiumDiscount,
    equilibrium,
    rangeFrom: roundPrice(swingLow),
    rangeTo: roundPrice(swingHigh),
  };
}

function buildSupplyDemandZones({ swings, orderBlocks, direction }) {
  const demand = [];
  const supply = [];

  const lows = swings.filter((s) => s.type === "low").slice(-4);
  const highs = swings.filter((s) => s.type === "high").slice(-4);

  for (const low of lows) {
    demand.push({
      from: roundPrice(low.price * 0.998),
      to: roundPrice(low.price * 1.002),
      strength: 0.6,
      freshness: "recent",
      touchCount: 1,
      label: "Demand zone",
    });
  }

  for (const high of highs) {
    supply.push({
      from: roundPrice(high.price * 0.998),
      to: roundPrice(high.price * 1.002),
      strength: 0.6,
      freshness: "recent",
      touchCount: 1,
      label: "Supply zone",
    });
  }

  for (const ob of orderBlocks) {
    const zone = {
      from: ob.from,
      to: ob.to,
      strength: ob.score,
      freshness: ob.status === "fresh" ? "fresh" : "mitigated",
      touchCount: 1,
      label: ob.label,
    };
    if (ob.direction === "bullish") demand.push(zone);
    else supply.push(zone);
  }

  return {
    demand: demand.slice(-5),
    supply: supply.slice(-5),
    orderBlocks,
  };
}

module.exports = {
  computePremiumDiscount,
  buildSupplyDemandZones,
};

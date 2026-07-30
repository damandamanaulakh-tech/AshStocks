function finite(value) {
  return Number.isFinite(value);
}

function evaluateSelectionMarketOverlay(market, parameters) {
  const missing = ["indiaVix", "fii5dNetCr", "dii5dNetCr"].filter(
    (field) => !finite(market?.[field]),
  );
  if (missing.length) {
    return {
      state: "DATA_INCOMPLETE",
      blockNewEntries: true,
      positionMultiplier: 0,
      missing,
      flags: [],
    };
  }

  const flags = [];
  let positionMultiplier = 1;
  const flow = parameters.marketOverlays.fiiLessThanDii5d;
  if (market.fii5dNetCr < market.dii5dNetCr) {
    flags.push("FII_LT_DII_5D");
    positionMultiplier *= flow.positionMultiplier;
  }
  if (market.fii5dNetCr < 0 && market.dii5dNetCr > 0) {
    flags.push("DII_CUSHIONED_FOREIGN_SELLING");
  }

  const vix = parameters.marketOverlays.indiaVix;
  let vixRegime = "LOW";
  let vixMultiplier = vix.lowMultiplier;
  let blockNewEntries = false;
  if (market.indiaVix < vix.veryLowUpperExclusive) {
    vixRegime = "VERY_LOW";
    vixMultiplier = vix.veryLowMultiplier;
  } else if (market.indiaVix < vix.lowUpperExclusive) {
    vixRegime = "LOW";
  } else if (market.indiaVix < vix.elevatedUpperExclusive) {
    vixRegime = "ELEVATED";
    vixMultiplier = vix.elevatedMultiplier;
  } else if (market.indiaVix < vix.highUpperExclusive) {
    vixRegime = "HIGH";
    vixMultiplier = vix.highMultiplier;
    blockNewEntries = vix.highBlockNewEntries;
  } else {
    vixRegime = "EXTREME";
    vixMultiplier = vix.extremeMultiplier;
    blockNewEntries = vix.extremeBlockNewEntries;
  }
  positionMultiplier = Number((positionMultiplier * vixMultiplier).toFixed(4));

  return {
    state: blockNewEntries ? "ENTRY_BLOCKED" : flags.length ? "CAUTION" : "NORMAL",
    blockNewEntries,
    positionMultiplier,
    vixRegime,
    vixMultiplier,
    missing: [],
    flags,
  };
}

function evaluateSelectionStock(stock, parameters) {
  const failures = [];
  if (!stock?.symbol) failures.push("symbol_missing");
  if (!finite(stock?.historySessions) || stock.historySessions < parameters.universe.minimumHistorySessions) {
    failures.push("insufficient_history");
  }
  if (!finite(stock?.dataAgeSessions) || stock.dataAgeSessions > parameters.universe.maximumDataAgeSessions) {
    failures.push("stale_price_data");
  }
  if (!finite(stock?.momentum20Percentile)) failures.push("momentum_rank_missing");

  const confirmations = [];
  if (stock.closeAboveMa50 === true) confirmations.push("TREND_50");
  if (finite(stock.volumeRatio20) && stock.volumeRatio20 >= parameters.confirmations.volume20.minimumMultiple) {
    confirmations.push("VOLUME_20");
  }
  if (
    finite(stock.deliveryPercentile20)
    && stock.deliveryPercentile20 >= parameters.confirmations.delivery20.minimumPercentile
    && (!parameters.confirmations.delivery20.requiresPositiveReturn1d || stock.return1d > 0)
  ) confirmations.push("DELIVERY_20");
  if (
    finite(stock.fii20dNetCr)
    && finite(stock.fii20dPercentile)
    && stock.fii20dNetCr > parameters.confirmations.fiiStock20.minimumNetCr
    && stock.fii20dPercentile >= parameters.confirmations.fiiStock20.minimumPercentile
  ) confirmations.push("FII_STOCK_20");
  if (parameters.confirmations.foOi.acceptedBullishLabels.includes(stock.oiRegime)) {
    confirmations.push("FO_OI_BULLISH");
  }

  return {
    symbol: String(stock?.symbol || ""),
    eligible: failures.length === 0,
    failures,
    primaryScore: finite(stock?.momentum20Percentile)
      ? Number((100 * stock.momentum20Percentile).toFixed(4))
      : null,
    confirmationCount: confirmations.length,
    confirmations,
    raw: stock,
  };
}

export function selectTradeInCandidates(input = {}, parameters) {
  if (parameters?.schemaVersion !== "0.1") {
    throw new Error("Validated stock-selection parameters v0.1 are required");
  }
  const market = evaluateSelectionMarketOverlay(input.market || {}, parameters);
  const evaluated = (Array.isArray(input.stocks) ? input.stocks : [])
    .map((stock) => evaluateSelectionStock(stock, parameters));
  const ranked = evaluated
    .filter((stock) => stock.eligible)
    .sort(
      (a, b) => (
        b.primaryScore - a.primaryScore
        || b.confirmationCount - a.confirmationCount
        || a.symbol.localeCompare(b.symbol)
      ),
    );
  const selected = ranked.slice(0, parameters.universe.selectionCount).map((stock, index) => ({
    rank: index + 1,
    symbol: stock.symbol,
    momentumScore: stock.primaryScore,
    confirmations: stock.confirmations,
    route: market.blockNewEntries ? "WATCH_ONLY" : "TRADE_IN_PAPER",
    maximumPositionPct: Number((
      parameters.positionSizing.maximumPositionPct * market.positionMultiplier
    ).toFixed(4)),
  }));

  return {
    mode: "PAPER_ONLY",
    edgeConfirmed: false,
    market,
    selected,
    eligibleCount: ranked.length,
    rejected: evaluated.filter((stock) => !stock.eligible).map((stock) => ({
      symbol: stock.symbol,
      failures: stock.failures,
    })),
  };
}

export { evaluateSelectionMarketOverlay, evaluateSelectionStock };

function finite(value) {
  return Number.isFinite(value);
}

function selectionRounded(value, digits = 8) {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function selectionClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function evaluateKellySizing(paperTrades = [], parameters) {
  const config = parameters?.positionSizing?.kelly;
  if (!config?.enabled) {
    return {
      id: config?.id || "RISK_KELLY_QUARTER_PAPER",
      status: "DISABLED",
      applied: false,
      blockNewEntries: false,
      maximumPositionPct: null,
      edgeConfirmed: false,
      liveReady: false,
    };
  }

  const costRate = config.applyTransactionCosts
    ? parameters.positionSizing.transactionCostOneWayPct / 100
    : 0;
  const lowerReturn = config.returnClipLowerPct / 100;
  const upperReturn = config.returnClipUpperPct / 100;
  const seen = new Set();
  const observations = [];
  let invalidClosedTrades = 0;

  for (const trade of Array.isArray(paperTrades) ? paperTrades : []) {
    if (String(trade?.side || "").toUpperCase() !== "SELL") continue;
    const key = String(
      trade.id
      || `${trade.order_id || trade.orderId || ""}|${trade.symbol || ""}|${trade.traded_at || ""}`,
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (observations.length >= config.maximumClosedTradesLookback) break;

    const qty = Number(trade.qty);
    const price = Number(trade.price);
    const exitValue = finite(Number(trade.value))
      ? Number(trade.value)
      : qty > 0 && price > 0 ? qty * price : null;
    const grossPnl = Number(trade.realized_pnl ?? trade.realizedPnl);
    const entryNotional = finite(exitValue) && finite(grossPnl) ? exitValue - grossPnl : null;
    if (
      !finite(exitValue)
      || !finite(grossPnl)
      || !finite(entryNotional)
      || exitValue <= 0
      || entryNotional <= 0
    ) {
      invalidClosedTrades += 1;
      continue;
    }

    const totalCost = costRate * (entryNotional + exitValue);
    const entryCapitalAtRisk = entryNotional * (1 + costRate);
    const netPnl = grossPnl - totalCost;
    const netReturn = selectionClamp(netPnl / entryCapitalAtRisk, lowerReturn, upperReturn);
    observations.push({
      symbol: String(trade.symbol || "").toUpperCase(),
      netReturn,
    });
  }

  const wins = observations.filter((trade) => trade.netReturn > 0);
  const losses = observations.filter((trade) => trade.netReturn <= 0);
  const distinctSymbols = new Set(
    observations.map((trade) => trade.symbol).filter(Boolean),
  ).size;
  const sampleReady = (
    observations.length >= config.minimumClosedTrades
    && distinctSymbols >= config.minimumDistinctSymbols
    && wins.length >= config.minimumWins
    && losses.length >= config.minimumLosses
  );
  const common = {
    id: config.id,
    mode: config.mode,
    inputSource: config.inputSource,
    validClosedTrades: observations.length,
    invalidClosedTrades,
    distinctSymbols,
    wins: wins.length,
    losses: losses.length,
    minimumClosedTrades: config.minimumClosedTrades,
    minimumDistinctSymbols: config.minimumDistinctSymbols,
    minimumWins: config.minimumWins,
    minimumLosses: config.minimumLosses,
    transactionCostOneWayPct: parameters.positionSizing.transactionCostOneWayPct,
    returnClipPct: [config.returnClipLowerPct, config.returnClipUpperPct],
    fractionOfKelly: config.fractionOfKelly,
    edgeConfirmed: false,
    liveReady: false,
  };

  if (!sampleReady) {
    return {
      ...common,
      status: "CALIBRATING",
      applied: false,
      blockNewEntries: false,
      smoothedWinRate: null,
      payoffRatio: null,
      rawKellyFraction: null,
      confidenceMultiplier: selectionRounded(
        Math.min(1, observations.length / config.fullConfidenceClosedTrades),
      ),
      fractionalKellyPct: 0,
      maximumPositionPct: null,
      reason: "Kelly is report-only until every sample gate passes.",
    };
  }

  const averageWin = wins.reduce((sum, trade) => sum + trade.netReturn, 0) / wins.length;
  const averageLoss = Math.abs(
    losses.reduce((sum, trade) => sum + trade.netReturn, 0) / losses.length,
  );
  const priorWins = config.priorEquivalentTrades * config.priorWinRate;
  const smoothedWinRate = (wins.length + priorWins)
    / (observations.length + config.priorEquivalentTrades);
  const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : null;
  const rawKellyFraction = payoffRatio > 0
    ? smoothedWinRate - (1 - smoothedWinRate) / payoffRatio
    : 0;
  const confidenceMultiplier = Math.min(
    1,
    observations.length / config.fullConfidenceClosedTrades,
  );
  const fractionalKelly = Math.max(0, rawKellyFraction)
    * config.fractionOfKelly
    * confidenceMultiplier;
  const maximumPositionPct = Math.min(
    config.maximumKellyPositionPct,
    fractionalKelly * 100,
  );
  const blockNewEntries = rawKellyFraction <= 0 || maximumPositionPct <= 0;

  return {
    ...common,
    status: blockNewEntries ? "NO_POSITIVE_EDGE" : "ACTIVE_PAPER_ONLY",
    applied: true,
    blockNewEntries,
    smoothedWinRate: selectionRounded(smoothedWinRate),
    averageNetWinPct: selectionRounded(averageWin * 100, 6),
    averageNetLossPct: selectionRounded(averageLoss * 100, 6),
    payoffRatio: selectionRounded(payoffRatio),
    expectancyNetPct: selectionRounded(
      (smoothedWinRate * averageWin - (1 - smoothedWinRate) * averageLoss) * 100,
      6,
    ),
    rawKellyFraction: selectionRounded(rawKellyFraction),
    confidenceMultiplier: selectionRounded(confidenceMultiplier),
    fractionalKellyPct: selectionRounded(fractionalKelly * 100, 6),
    maximumPositionPct: selectionRounded(maximumPositionPct, 6),
    reason: blockNewEntries
      ? "Post-cost paper sample has no positive Kelly edge; new entries are blocked."
      : "Quarter-Kelly is active as an additional paper position cap.",
  };
}

function evaluateSelectionMarketOverlay(market, parameters) {
  const missing = ["indiaVix", "fii5dNetCr", "dii5dNetCr"].filter(
    (field) => !finite(market?.[field]),
  );
  const drawdown = parameters.marketOverlays.portfolioDrawdown;
  if (
    !finite(market?.portfolioDrawdownPct)
    || market.portfolioDrawdownPct < drawdown.allowedRangePct[0]
    || market.portfolioDrawdownPct > drawdown.allowedRangePct[1]
  ) {
    missing.push("portfolioDrawdownPct");
  }
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
  if (market.portfolioDrawdownPct <= drawdown.triggerPctInclusive) {
    flags.push("PORTFOLIO_DRAWDOWN_GOVERNOR");
    blockNewEntries = drawdown.blockNewEntries;
    positionMultiplier *= drawdown.positionMultiplier;
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
  const annotations = [];
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
  if (parameters.confirmations.foOi.participationOnlyLabels.includes(stock.oiRegime)) {
    annotations.push("FO_OI_HEAVY_PARTICIPATION");
  }
  if (parameters.confirmations.foOi.bearishLabels.includes(stock.oiRegime)) {
    annotations.push("FO_OI_LONG_UNWINDING");
  }
  if (finite(stock.fpiCategoryTotalPctMwpl)) {
    annotations.push("FPI_MWPL_PROFILE_UNVALIDATED");
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
    annotations,
    raw: stock,
  };
}

export function selectTradeInCandidates(input = {}, parameters) {
  if (parameters?.schemaVersion !== "0.1") {
    throw new Error("Validated stock-selection parameters v0.1 are required");
  }
  const market = evaluateSelectionMarketOverlay(input.market || {}, parameters);
  const kelly = evaluateKellySizing(input.paperTrades || [], parameters);
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
  const basePositionCapPct = parameters.positionSizing.maximumPositionPct;
  const preOverlayPositionCapPct = kelly.applied
    ? Math.min(basePositionCapPct, kelly.maximumPositionPct)
    : basePositionCapPct;
  const blockNewEntries = market.blockNewEntries || kelly.blockNewEntries;
  const maximumPositionPct = blockNewEntries
    ? 0
    : Number((preOverlayPositionCapPct * market.positionMultiplier).toFixed(4));
  const selected = ranked.slice(0, parameters.universe.selectionCount).map((stock, index) => ({
    rank: index + 1,
    symbol: stock.symbol,
    momentumScore: stock.primaryScore,
    confirmations: stock.confirmations,
    annotations: stock.annotations,
    route: blockNewEntries ? "WATCH_ONLY" : "TRADE_IN_PAPER",
    maximumPositionPct,
  }));

  return {
    mode: "PAPER_ONLY",
    edgeConfirmed: false,
    market,
    kelly,
    sizing: {
      basePositionCapPct,
      preOverlayPositionCapPct: selectionRounded(preOverlayPositionCapPct, 6),
      marketPositionMultiplier: market.positionMultiplier,
      finalMaximumPositionPct: maximumPositionPct,
      maximumPortfolioHeatPct: parameters.positionSizing.maximumPortfolioHeatPct,
    },
    selected,
    eligibleCount: ranked.length,
    rejected: evaluated.filter((stock) => !stock.eligible).map((stock) => ({
      symbol: stock.symbol,
      failures: stock.failures,
    })),
  };
}

export { evaluateKellySizing, evaluateSelectionMarketOverlay, evaluateSelectionStock };

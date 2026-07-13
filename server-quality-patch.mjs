export function applyAdvancedScannerPatches(output, mustReplace) {
  output = mustReplace(
    output,
    '  { key: "absolute_momentum", group: "Momentum", label: "6M and 12M return positive", threshold: "> 0%", weight: 0, gate: true },',
    `  { key: "absolute_momentum", group: "Momentum", label: "6M and 12M return positive", threshold: "> 0%", weight: 0, gate: true },
  { key: "min_6m_return", group: "Momentum", label: "Minimum 6M return", threshold: ">= 8%", weight: 0, gate: true },
  { key: "min_12m_return", group: "Momentum", label: "Minimum 12M return", threshold: ">= 12%", weight: 0, gate: true },
  { key: "volatility_cap", group: "Risk", label: "252D volatility cap", threshold: "<= 55%", weight: 0, gate: true },
  { key: "target_potential_gate", group: "Portfolio", label: "Enough room to 252D high", threshold: ">= target potential", weight: 0, gate: true },`,
    'advanced scanner parameters'
  );

  output = mustReplace(
    output,
    '    turnoverCrMin: 5,\n    correlationThreshold: 0.85,',
    '    turnoverCrMin: 5,\n    minReturn6mPct: 8,\n    minReturn12mPct: 12,\n    maxVol252Pct: 55,\n    targetPotentialHardGate: true,\n    correlationThreshold: 0.85,',
    'advanced scanner default settings'
  );

  output = mustReplace(
    output,
    '    turnoverCrMin: finiteOr(input.turnoverCrMin ?? input.min_rupee_volume_cr, 5),\n    correlationThreshold: finiteOr(input.correlationThreshold ?? input.correlation_threshold, 0.85),',
    '    turnoverCrMin: finiteOr(input.turnoverCrMin ?? input.min_rupee_volume_cr, 5),\n    minReturn6mPct: finiteOr(input.minReturn6mPct ?? input.min_return_6m_pct, 8),\n    minReturn12mPct: finiteOr(input.minReturn12mPct ?? input.min_return_12m_pct, 12),\n    maxVol252Pct: finiteOr(input.maxVol252Pct ?? input.max_252d_vol_pct, 55),\n    targetPotentialHardGate: parseBoolean(input.targetPotentialHardGate ?? input.target_potential_hard_gate ?? true),\n    correlationThreshold: finiteOr(input.correlationThreshold ?? input.correlation_threshold, 0.85),',
    'advanced scanner normalized settings'
  );

  output = mustReplace(
    output,
    '    instrument_key: String(row.instrument_key || row.instrumentKey || row.upstox_key || "").trim(),\n    isin: String(row.isin || "").trim(),',
    '    instrument_key: String(row.instrument_key || row.instrumentKey || row.upstox_key || "").trim(),\n    trading_symbol: String(row.trading_symbol || row.tradingsymbol || row.tradingSymbol || row.symbol || "").trim().slice(0, 80),\n    exchange_token: String(row.exchange_token || row.exchangeToken || "").trim(),\n    lot_size: numericValue(row.lot_size ?? row.lotSize),\n    tick_size: numericValue(row.tick_size ?? row.tickSize),\n    asset_type: String(row.asset_type || row.assetType || "").trim().toUpperCase(),\n    isin: String(row.isin || "").trim(),',
    'preserve complete master metadata'
  );

  output = mustReplace(
    output,
    '  const momentumOk = metrics.return6m !== null && metrics.return12m !== null && metrics.return6m > 0 && metrics.return12m > 0;\n  const liquiditySharesOk = metrics.adv20 !== null && metrics.adv20 >= settings.adv20Min;',
    '  const minReturn6m = settings.minReturn6mPct / 100;\n  const minReturn12m = settings.minReturn12mPct / 100;\n  const return6mOk = metrics.return6m !== null && metrics.return6m >= minReturn6m;\n  const return12mOk = metrics.return12m !== null && metrics.return12m >= minReturn12m;\n  const momentumOk = return6mOk && return12mOk;\n  const liquiditySharesOk = metrics.adv20 !== null && metrics.adv20 >= settings.adv20Min;',
    'advanced momentum thresholds'
  );

  output = mustReplace(
    output,
    '  const stuckOk = metrics.stuckCandle === false;\n  const correlation = correlationGate(row, holdings, settings.correlationThreshold);',
    '  const stuckOk = metrics.stuckCandle === false;\n  const volatilityOk = metrics.vol252 !== null && metrics.vol252 * 100 <= settings.maxVol252Pct;\n  const correlation = correlationGate(row, holdings, settings.correlationThreshold);',
    'volatility gate'
  );

  output = mustReplace(
    output,
    '  const score = missing.length || momentum === null || qualityScore === null ? 0 : round(0.65 * momentum + 0.35 * qualityScore, 2);\n  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);',
    '  const score = missing.length || momentum === null || qualityScore === null ? 0 : round(0.65 * momentum + 0.35 * qualityScore, 2);\n  const targetPotential = targetPotentialLabel(metrics, settings.targetPotentialPct);\n  const targetPotentialOk = !settings.targetPotentialHardGate || targetPotential.label === "PASS";',
    'target potential gate'
  );

  output = mustReplace(
    output,
    '  } else if (!momentumOk || !liquiditySharesOk || !liquidityRupeeOk || !staleOk || !stuckOk || !correlation.ok) {',
    '  } else if (!momentumOk || !liquiditySharesOk || !liquidityRupeeOk || !staleOk || !stuckOk || !volatilityOk || !targetPotentialOk || !correlation.ok) {',
    'advanced gate decision branch'
  );

  output = mustReplace(
    output,
    '    if (!momentumOk) reasons.push("absolute momentum gate failed");\n    if (!liquiditySharesOk) reasons.push("ADV20 liquidity gate failed");',
    '    if (!return6mOk) reasons.push(`6M return below ${settings.minReturn6mPct}%`);\n    if (!return12mOk) reasons.push(`12M return below ${settings.minReturn12mPct}%`);\n    if (!liquiditySharesOk) reasons.push("ADV20 liquidity gate failed");',
    'advanced gate reasons'
  );

  output = mustReplace(
    output,
    '    if (!staleOk) reasons.push("last candle is stale");\n    if (!stuckOk) reasons.push("latest OHLC stuck candle check failed");',
    '    if (!staleOk) reasons.push("last candle is stale");\n    if (!stuckOk) reasons.push("latest OHLC stuck candle check failed");\n    if (!volatilityOk) reasons.push(`252D volatility above ${settings.maxVol252Pct}%`);\n    if (!targetPotentialOk) reasons.push("target-potential hard gate failed");',
    'advanced risk reasons'
  );

  output = mustReplace(
    output,
    '      absolute_momentum: momentumOk,\n      liquidity_shares: liquiditySharesOk,',
    '      absolute_momentum: momentumOk,\n      min_return_6m: return6mOk,\n      min_return_12m: return12mOk,\n      liquidity_shares: liquiditySharesOk,',
    'advanced gate output momentum'
  );

  output = mustReplace(
    output,
    '      stuck_candle: stuckOk,\n      correlation: correlation.ok,',
    '      stuck_candle: stuckOk,\n      volatility_cap: volatilityOk,\n      target_potential: targetPotentialOk,\n      correlation: correlation.ok,',
    'advanced gate output risk'
  );

  output = mustReplace(
    output,
    '      hard_gates: ["data_sufficiency", "absolute_momentum", "liquidity_shares", "liquidity_rupee", "fresh_candle", "stuck_candle", "correlation"],',
    '      hard_gates: ["data_sufficiency", "absolute_momentum", "min_return_6m", "min_return_12m", "liquidity_shares", "liquidity_rupee", "fresh_candle", "stuck_candle", "volatility_cap", "target_potential", "correlation"],',
    'advanced proof gate list'
  );

  output = mustReplace(
    output,
    '  const maxLimit = Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 60))));',
    '  const maxLimit = Math.min(200, Math.max(1, Math.floor(finiteOr(ENV.UPSTOX_SCAN_LIMIT, 120))));',
    'upstox scan default limit'
  );

  output = mustReplace(
    output,
    '  const url = String(options.url || UPSTOX_NSE_INSTRUMENTS_URL);',
    '  const url = String(options.url || ENV.UPSTOX_INSTRUMENTS_URL || UPSTOX_COMPLETE_INSTRUMENTS_URL);',
    'complete master default url'
  );

  output = mustReplace(
    output,
    '    data_source: "Upstox NSE instruments JSON"',
    '    trading_symbol: String(record.trading_symbol || record.tradingsymbol || symbol).trim(),\n    exchange_token: String(record.exchange_token || "").trim(),\n    lot_size: numericValue(record.lot_size),\n    tick_size: numericValue(record.tick_size),\n    asset_type: String(record.asset_type || "").trim().toUpperCase(),\n    data_source: "Upstox complete instruments JSON"',
    'complete master scanner row fields'
  );

  output = mustReplace(
    output,
    '    source: "Upstox NSE instruments JSON",',
    '    source: url.includes("complete") ? "Upstox complete instruments JSON" : "Upstox NSE instruments JSON",',
    'complete master load source'
  );

  output = mustReplace(
    output,
    `      const summary = dataBankSummary(state);
      if (summary.universe_count > INDIA_UNIVERSE.length && summary.rows_with_instrument_key > INDIA_UNIVERSE.length) {
        const skipped = {`,
    `      const summary = dataBankSummary(state);
      const hasCompleteMaster = summary.data_sources.some((source) => String(source).includes("complete instruments"));
      if (hasCompleteMaster && summary.universe_count > INDIA_UNIVERSE.length && summary.rows_with_instrument_key > INDIA_UNIVERSE.length) {
        const skipped = {`,
    'reload if existing master is not complete'
  );

  output = mustReplace(
    output,
    `function dataBankBootstrapStatus() {
  return {
    enabled: dataBankAutoBootstrapEnabled(),
    running: dataBankBootstrapState.running,
    startedAt: dataBankBootstrapState.startedAt,
    lastAttemptAt: dataBankBootstrapState.lastAttemptAt,
    completedAt: dataBankBootstrapState.completedAt,
    lastResult: dataBankBootstrapState.lastResult,
    lastError: dataBankBootstrapState.lastError
  };
}

async function runDataBankBootstrap`,
    `function dataBankBootstrapStatus() {
  return {
    enabled: dataBankAutoBootstrapEnabled(),
    running: dataBankBootstrapState.running,
    startedAt: dataBankBootstrapState.startedAt,
    lastAttemptAt: dataBankBootstrapState.lastAttemptAt,
    completedAt: dataBankBootstrapState.completedAt,
    lastResult: dataBankBootstrapState.lastResult,
    lastError: dataBankBootstrapState.lastError
  };
}

function dataBankHealthSummary() {
  const summary = dataBankSummary();
  const loaded = dataBankBootstrapState.lastResult;
  if (loaded?.saved_universe > summary.universe_count) {
    return {
      ...summary,
      universe_count: loaded.saved_universe,
      rows_with_instrument_key: loaded.rows_with_instrument_key || loaded.saved_universe,
      data_sources: loaded.data_sources || summary.data_sources
    };
  }
  return summary;
}

async function runDataBankBootstrap`,
    'data bank health summary helper'
  );

  output = mustReplace(
    output,
    '          data_bank: dataBankSummary(),',
    '          data_bank: dataBankHealthSummary(),',
    'health uses bootstrapped data bank count'
  );

  return output;
}

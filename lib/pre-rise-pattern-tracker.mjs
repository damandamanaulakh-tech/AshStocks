function preRiseFinite(value) {
  return Number.isFinite(Number(value));
}

function preRiseRound(value, digits = 4) {
  if (!preRiseFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizePreRiseCandle(candle) {
  if (Array.isArray(candle)) {
    return {
      date: candle[0],
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5] || 0),
    };
  }
  return {
    date: candle?.date || candle?.timestamp || candle?.time || null,
    open: Number(candle?.open),
    high: Number(candle?.high),
    low: Number(candle?.low),
    close: Number(candle?.close),
    volume: Number(candle?.volume || candle?.vol || 0),
  };
}

function mean(values) {
  const valid = values.filter((value) => preRiseFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length;
}

export function evaluatePreRisePattern(candles = [], parameters = {}) {
  const normalized = (Array.isArray(candles) ? candles : [])
    .map(normalizePreRiseCandle)
    .filter((candle) => (
      preRiseFinite(candle.open)
      && preRiseFinite(candle.high)
      && preRiseFinite(candle.low)
      && preRiseFinite(candle.close)
      && preRiseFinite(candle.volume)
      && candle.high >= candle.low
      && candle.volume >= 0
    ));
  const minimumCandles = Number(parameters?.minimumData?.dailyCandles || 50);
  const modelVersion = parameters?.modelVersion || "ashstocks-pre-rise-pattern-v0.1";
  const common = {
    modelVersion,
    mode: parameters?.mode || "observe_and_paper_only",
    edgeConfirmed: false,
    liveReady: false,
    changesScannerRanking: false,
    changesPositionSizing: false,
    changesKellySizing: false,
    allowsLiveOrder: false,
    paperTradePermission: false,
  };

  if (normalized.length < minimumCandles) {
    return {
      ...common,
      status: "DATA_NEEDED",
      score: 0,
      patternId: null,
      insideBarsIn10: null,
      positiveVolumeMultipleVs20d: null,
      positiveClose: null,
      evidence: `Need ${minimumCandles} daily candles; received ${normalized.length}.`,
      reason: "The pre-rise tracker remains unavailable until enough candle history is present.",
    };
  }

  const latest = normalized.at(-1);
  const previous = normalized.at(-2);
  const last20 = normalized.slice(-20);
  const averageVolume20 = mean(last20.map((candle) => candle.volume));
  const positiveVolumeMultipleVs20d = averageVolume20 > 0
    ? latest.volume / averageVolume20
    : null;
  const positiveClose = latest.close > previous.close;
  const comparisonWindow = normalized.slice(-11);
  let insideBarsIn10 = 0;
  for (let index = 1; index < comparisonWindow.length; index += 1) {
    const candle = comparisonWindow[index];
    const prior = comparisonWindow[index - 1];
    if (candle.high <= prior.high && candle.low >= prior.low) insideBarsIn10 += 1;
  }

  const watch = parameters?.patterns?.watch || {};
  const strong = parameters?.patterns?.strong || {};
  const watchHit = (
    insideBarsIn10 >= Number(watch.minimumInsideBarsIn10 || 2)
    && positiveVolumeMultipleVs20d >= Number(watch.minimumPositiveVolumeMultipleVs20d || 1.5)
    && (!watch.requiresPositiveClose || positiveClose)
  );
  const strongHit = (
    insideBarsIn10 >= Number(strong.minimumInsideBarsIn10 || 3)
    && positiveVolumeMultipleVs20d >= Number(strong.minimumPositiveVolumeMultipleVs20d || 1.5)
    && (!strong.requiresPositiveClose || positiveClose)
  );
  const compressionOnly = insideBarsIn10 >= Number(watch.minimumInsideBarsIn10 || 2);
  const status = strongHit
    ? "STRONG"
    : watchHit
      ? "WATCH"
      : compressionOnly
        ? "COMPRESSION_ONLY"
        : "NO_HIT";
  const score = strongHit ? 80 : watchHit ? 65 : compressionOnly ? 35 : 0;
  const patternId = strongHit
    ? strong.id
    : watchHit
      ? watch.id
      : null;
  const evidenceKey = strongHit ? "strong" : watchHit ? "watch" : null;
  const historicalEvidence = evidenceKey
    ? parameters?.evidence?.[evidenceKey] || null
    : null;

  return {
    ...common,
    status,
    score,
    scoreMeaning: "Display severity only; not a probability and not a trade score.",
    patternId,
    patternName: strongHit
      ? strong.name
      : watchHit
        ? watch.name
        : compressionOnly
          ? "Compression present; positive-volume ignition absent"
          : "No compression-to-volume ignition",
    asOf: latest.date || null,
    insideBarsIn10,
    positiveVolumeMultipleVs20d: preRiseRound(positiveVolumeMultipleVs20d, 4),
    positiveClose,
    latestClose: preRiseRound(latest.close, 4),
    latestVolume: preRiseRound(latest.volume, 0),
    averageVolume20: preRiseRound(averageVolume20, 0),
    historicalEvidence,
    evidence: (
      `${insideBarsIn10} inside bars in the latest 10 comparisons; `
      + `volume ${preRiseRound(positiveVolumeMultipleVs20d, 2) ?? "NA"}x its 20-session average; `
      + `close ${positiveClose ? "rose" : "did not rise"} versus the prior session.`
    ),
    reason: strongHit
      ? "Repeated compression plus positive 1.5x volume ignition: strong observation hit."
      : watchHit
        ? "Compression plus positive 1.5x volume ignition: observation watch."
        : compressionOnly
          ? "Compression exists, but the empirically tested positive-volume ignition is absent."
          : "The repeated compression-to-positive-volume pattern is not present.",
  };
}

export { normalizePreRiseCandle };

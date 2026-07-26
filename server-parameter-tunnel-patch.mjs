import { readFileSync } from "node:fs";

const parameterCatalog = JSON.parse(
  readFileSync(new URL("./data/parameter-catalog-175.json", import.meta.url), "utf8")
);
const catalogJson = JSON.stringify(parameterCatalog);

const PARAMETER_TUNNEL_FUNCTIONS = String.raw`
const PARAMETER_TUNNEL_CATALOG = Object.freeze(${catalogJson});
const PARAMETER_TUNNEL_VERSION = PARAMETER_TUNNEL_CATALOG.version;
let latestParameterTunnelScan = null;

function tunnelFinite(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function tunnelAverage(values = []) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function tunnelSma(values = [], period = values.length) {
  return values.length >= period ? tunnelAverage(values.slice(-period)) : null;
}

function tunnelStdev(values = [], period = values.length) {
  if (values.length < period) return null;
  const clean = values.slice(-period).map(Number).filter(Number.isFinite);
  const mean = tunnelAverage(clean);
  return mean === null ? null : Math.sqrt(tunnelAverage(clean.map((value) => (value - mean) ** 2)));
}

function tunnelSlope(values = [], period = values.length) {
  if (values.length < period || period < 2) return null;
  const sample = values.slice(-period).map(Number);
  if (!sample.every(Number.isFinite)) return null;
  const xMean = (period - 1) / 2;
  const yMean = tunnelAverage(sample);
  let numerator = 0;
  let denominator = 0;
  sample.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator ? numerator / denominator : null;
}

function tunnelPercentile(value, values = []) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!Number.isFinite(value) || !clean.length) return null;
  return (clean.filter((item) => item <= value).length / clean.length) * 100;
}

function tunnelReturns(closes = []) {
  const output = [];
  for (let index = 1; index < closes.length; index += 1) {
    if (closes[index - 1] > 0 && closes[index] > 0) output.push(closes[index] / closes[index - 1] - 1);
  }
  return output;
}

function tunnelAtrSeries(candles = [], period = 14) {
  const trueRanges = candles.map((candle, index) => {
    const previousClose = index ? candles[index - 1].close : candle.close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  return trueRanges.map((_, index) => index + 1 >= period ? tunnelAverage(trueRanges.slice(index + 1 - period, index + 1)) : null);
}

function tunnelRsiSeries(closes = [], period = 14) {
  const output = closes.map(() => null);
  for (let index = period; index < closes.length; index += 1) {
    const changes = closes.slice(index - period, index + 1).slice(1).map((value, offset) => value - closes[index - period + offset]);
    const gain = tunnelAverage(changes.map((value) => Math.max(0, value))) || 0;
    const loss = tunnelAverage(changes.map((value) => Math.max(0, -value))) || 0;
    output[index] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return output;
}

function tunnelObv(candles = []) {
  let value = 0;
  return candles.map((candle, index) => {
    if (index) value += candle.close > candles[index - 1].close ? candle.volume : candle.close < candles[index - 1].close ? -candle.volume : 0;
    return value;
  });
}

function tunnelClv(candle = {}) {
  const range = candle.high - candle.low;
  return range > 0 ? (candle.close - candle.low) / range : 0.5;
}

function tunnelMfi(candles = [], period = 14) {
  if (candles.length < period + 1) return null;
  let positive = 0;
  let negative = 0;
  const sample = candles.slice(-(period + 1));
  for (let index = 1; index < sample.length; index += 1) {
    const typical = (sample[index].high + sample[index].low + sample[index].close) / 3;
    const previous = (sample[index - 1].high + sample[index - 1].low + sample[index - 1].close) / 3;
    const flow = typical * sample[index].volume;
    if (typical >= previous) positive += flow;
    else negative += flow;
  }
  if (!negative) return 100;
  return 100 - 100 / (1 + positive / negative);
}

function tunnelCmf(candles = [], period = 20) {
  if (candles.length < period) return null;
  const sample = candles.slice(-period);
  const volume = sample.reduce((sum, candle) => sum + candle.volume, 0);
  if (!volume) return null;
  const moneyFlow = sample.reduce((sum, candle) => {
    const range = candle.high - candle.low;
    const multiplier = range > 0 ? ((candle.close - candle.low) - (candle.high - candle.close)) / range : 0;
    return sum + multiplier * candle.volume;
  }, 0);
  return moneyFlow / volume;
}

function tunnelResult(parameter, state, value, evidence, effect = "") {
  return {
    id: parameter.id,
    stage: parameter.stage,
    family: parameter.family,
    name: parameter.name,
    state,
    value,
    evidence,
    effect: effect || (state === "HIT" ? "adds evidence" : state === "RISK" ? "removes or reduces rank" : state === "CLEAR" ? "risk gate clear" : state === "MISS" ? "does not add evidence" : "not counted")
  };
}

function tunnelUnavailable(parameter) {
  return tunnelResult(
    parameter,
    "SOURCE_REQUIRED",
    null,
    "Requires " + parameter.required + " from " + parameter.source,
    "not counted until the named real feed is connected"
  );
}

function tunnelCheck(parameter, condition, value, evidence, risk = false) {
  if (condition === null || condition === undefined) return tunnelUnavailable(parameter);
  if (risk) return tunnelResult(parameter, condition ? "RISK" : "CLEAR", value, evidence);
  return tunnelResult(parameter, condition ? "HIT" : "MISS", value, evidence);
}

function parameterTunnelData(row = {}) {
  const candles = normalizeCandles(row.candles || []);
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);
  const latest = candles.at(-1) || null;
  const previous = candles.at(-2) || null;
  const returns = tunnelReturns(closes);
  const atrSeries = tunnelAtrSeries(candles);
  const rsiSeries = tunnelRsiSeries(closes);
  const obv = tunnelObv(candles);
  const sma20 = tunnelSma(closes, 20);
  const sma50 = tunnelSma(closes, 50);
  const sma200 = tunnelSma(closes, 200);
  const vol20 = tunnelSma(volumes, 20);
  const atr14 = atrSeries.at(-1);
  const high20Prior = highs.length >= 21 ? Math.max(...highs.slice(-21, -1)) : null;
  const high20 = highs.length >= 20 ? Math.max(...highs.slice(-20)) : null;
  const low20 = lows.length >= 20 ? Math.min(...lows.slice(-20)) : null;
  const high252 = highs.length >= 252 ? Math.max(...highs.slice(-252)) : null;
  const low252 = lows.length >= 252 ? Math.min(...lows.slice(-252)) : null;
  const clv = candles.map(tunnelClv);
  return {
    candles, closes, highs, lows, volumes, latest, previous, returns, atrSeries, rsiSeries, obv, clv,
    sma20, sma50, sma200, vol20, atr14, high20Prior, high20, low20, high252, low252,
    close: latest?.close ?? tunnelFinite(row.close),
    return21: closes.length >= 22 ? closes.at(-1) / closes.at(-22) - 1 : null,
    return63: closes.length >= 64 ? closes.at(-1) / closes.at(-64) - 1 : tunnelFinite(row.return_6m_pct) === null ? null : tunnelFinite(row.return_6m_pct) / 200,
    return126: closes.length >= 127 ? closes.at(-1) / closes.at(-127) - 1 : tunnelFinite(row.return_6m_pct) === null ? null : tunnelFinite(row.return_6m_pct) / 100,
    return252: closes.length >= 253 ? closes.at(-1) / closes.at(-253) - 1 : tunnelFinite(row.return_12m_pct) === null ? null : tunnelFinite(row.return_12m_pct) / 100
  };
}

function buildParameterTunnelContext(rows = [], holdings = []) {
  const return12 = rows.map((row) => tunnelFinite(row.return_12m_pct)).filter(Number.isFinite);
  const return6 = rows.map((row) => tunnelFinite(row.return_6m_pct)).filter(Number.isFinite);
  const scores = rows.map((row) => tunnelFinite(row.score)).filter(Number.isFinite);
  const sectors = new Map();
  rows.forEach((row) => {
    const sector = String(row.sector || "Unmapped");
    if (!sectors.has(sector)) sectors.set(sector, []);
    sectors.get(sector).push(tunnelFinite(row.return_12m_pct, 0));
  });
  return { return12, return6, scores, sectors, holdings: Array.isArray(holdings) ? holdings : [] };
}

function evaluateParameterTunnelNode(parameter, row, data, context) {
  const { candles, closes, highs, lows, volumes, latest, previous, returns, atrSeries, rsiSeries, obv, clv } = data;
  const fmt = (value, suffix = "") => Number.isFinite(value) ? round(value, 3) + suffix : null;
  const range = latest ? latest.high - latest.low : null;
  const body = latest ? Math.abs(latest.close - latest.open) : null;
  const lowerWick = latest ? Math.min(latest.open, latest.close) - latest.low : null;
  const upperWick = latest ? latest.high - Math.max(latest.open, latest.close) : null;
  const lastRanges = candles.slice(-14).map((candle) => candle.high - candle.low);
  const vol5 = tunnelSma(volumes, 5);
  const ret10 = closes.length >= 11 ? closes.at(-1) / closes.at(-11) - 1 : null;
  const downVol5 = candles.slice(-5).reduce((sum, candle, index, sample) => sum + (index && candle.close < sample[index - 1].close ? candle.volume : 0), 0);
  const totalVol5 = candles.slice(-5).reduce((sum, candle) => sum + candle.volume, 0);
  const downVol7 = candles.slice(-7).reduce((sum, candle, index, sample) => sum + (index && candle.close < sample[index - 1].close ? candle.volume : 0), 0);
  const totalVol7 = candles.slice(-7).reduce((sum, candle) => sum + candle.volume, 0);
  const positive = (condition, value, evidence) => tunnelCheck(parameter, condition, value, evidence);
  const risk = (condition, value, evidence) => tunnelCheck(parameter, condition, value, evidence, true);
  const id = parameter.id;

  if (!latest) return tunnelUnavailable(parameter);

  if (id === "B22_P001") return positive(data.sma20 === null ? null : data.close > data.sma20, fmt(data.close), "Close " + fmt(data.close) + " versus SMA20 " + fmt(data.sma20));
  if (id === "B22_P002") return positive(data.sma50 === null ? null : data.close > data.sma50, fmt(data.close), "Close " + fmt(data.close) + " versus SMA50 " + fmt(data.sma50));
  if (id === "B22_P003") return positive(data.sma200 === null ? null : data.close > data.sma200, fmt(data.close), "Close " + fmt(data.close) + " versus SMA200 " + fmt(data.sma200));
  if (id === "B22_P004") return positive(data.sma20 === null || data.sma50 === null ? null : data.sma20 > data.sma50, fmt(data.sma20), "SMA20 " + fmt(data.sma20) + " versus SMA50 " + fmt(data.sma50));
  if (id === "B22_P005") return positive(data.sma50 === null || data.sma200 === null ? null : data.sma50 > data.sma200, fmt(data.sma50), "SMA50 " + fmt(data.sma50) + " versus SMA200 " + fmt(data.sma200));
  if (id === "B02_P006") return positive(data.return21 === null ? null : data.return21 > 0, fmt(data.return21 * 100, "%"), "21-session return " + fmt(data.return21 * 100, "%"));
  if (id === "B02_P007") return positive(data.return63 === null ? null : data.return63 > 0, fmt(data.return63 * 100, "%"), "63-session return " + fmt(data.return63 * 100, "%"));
  if (id === "B02_P008") return positive(data.return126 === null ? null : data.return126 >= 0.08, fmt(data.return126 * 100, "%"), "126-session return " + fmt(data.return126 * 100, "%"));
  if (id === "B02_P009") return positive(data.return252 === null ? null : data.return252 >= 0.12, fmt(data.return252 * 100, "%"), "252-session return " + fmt(data.return252 * 100, "%"));
  if (id === "B22_P010") return positive(data.high20Prior === null ? null : data.close > data.high20Prior, fmt(data.close), "Close " + fmt(data.close) + " versus prior 20D high " + fmt(data.high20Prior));
  if (id === "B22_P011") return positive(!latest || !previous ? null : latest.close > latest.open && previous.close < previous.open && latest.open <= previous.close && latest.close >= previous.open, fmt(body), "Latest body " + fmt(body) + "; prior body " + fmt(previous ? Math.abs(previous.close - previous.open) : null));
  if (id === "B22_P012") return positive(!latest || !body ? null : lowerWick > 2 * body && latest.close > latest.open, fmt(lowerWick), "Lower wick " + fmt(lowerWick) + " versus body " + fmt(body));
  if (id === "B22_P013") return positive(!latest || !previous ? null : latest.high < previous.high && latest.low > previous.low, fmt(range), "Latest range " + fmt(range) + " inside prior range " + fmt(previous ? previous.high - previous.low : null));
  if (id === "B22_P014" || id === "T12W_0001") return positive(lastRanges.length < 7 ? null : range <= Math.min(...lastRanges.slice(-7)), fmt(range), "Latest range " + fmt(range) + " versus seven-session minimum " + fmt(Math.min(...lastRanges.slice(-7))));
  if (id === "B15_P015") return positive(data.vol20 === null ? null : latest.volume > data.vol20, fmt(latest?.volume), "Volume " + fmt(latest?.volume) + " versus SMA20 " + fmt(data.vol20));
  if (id === "B15_P016") {
    if (candles.length < 21) return tunnelUnavailable(parameter);
    const sample = candles.slice(-20);
    let up = 0;
    let down = 0;
    sample.forEach((candle, index) => { const prior = candles[candles.length - 21 + index]; if (candle.close >= prior.close) up += candle.volume; else down += candle.volume; });
    return positive(up > down, fmt(up / Math.max(1, down), "x"), "Up-volume/down-volume " + fmt(up / Math.max(1, down), "x"));
  }
  if (id === "B15_P017") return positive(!latest ? null : latest.close * latest.volume / 10000000 >= 5, fmt(latest ? latest.close * latest.volume / 10000000 : null, "cr"), "Latest rupee turnover " + fmt(latest ? latest.close * latest.volume / 10000000 : null, "cr"));
  if (id === "B19_P018") {
    if (candles.length < 30 || data.vol20 === null) return tunnelUnavailable(parameter);
    const spike = candles.slice(-10).some((candle, index, sample) => index && candle.close < sample[index - 1].close && candle.volume > 2 * data.vol20);
    return positive(!spike, spike ? 1 : 0, spike ? "Distribution spike present" : "No down day above 2x volume SMA20");
  }
  if (id === "B19_P019") return positive(data.high252 === null ? null : (data.high252 - data.close) / data.high252 < 0.25, fmt(data.high252 === null ? null : (data.high252 - data.close) / data.high252 * 100, "%"), "Drawdown from 252D high");
  if (id === "B19_P020") return positive(data.high252 === null || data.low252 === null || data.high252 === data.low252 ? null : (data.close - data.low252) / (data.high252 - data.low252) > 0.5, fmt(data.high252 === null || data.low252 === null ? null : (data.close - data.low252) / (data.high252 - data.low252) * 100, "%"), "Position inside 52-week range");
  if (id === "B22_P021") return positive(data.atr14 === null || !data.close ? null : data.atr14 / data.close > 0.01, fmt(data.atr14 === null || !data.close ? null : data.atr14 / data.close * 100, "%"), "ATR14 as percent of close");
  if (id === "B22_P022") return positive(returns.length < 20 ? null : tunnelAverage(returns.slice(-20).map(Math.abs)) < 0.04, fmt(returns.length < 20 ? null : tunnelAverage(returns.slice(-20).map(Math.abs)) * 100, "%"), "Mean absolute daily return over 20 sessions");
  if (id === "B22_P023") {
    const stdev = tunnelStdev(closes, 20);
    return positive(stdev === null || data.sma20 === null ? null : 4 * stdev / data.sma20 < 0.12, fmt(stdev === null || data.sma20 === null ? null : 4 * stdev / data.sma20 * 100, "%"), "Approximate Bollinger width");
  }

  if (id === "T12W_0002") return positive(lastRanges.length < 14 ? null : range <= Math.min(...lastRanges), fmt(range), "Latest range versus 14-session minimum");
  if (id === "T12W_0003") {
    const widths = closes.map((_, index) => index >= 19 ? 4 * tunnelStdev(closes.slice(0, index + 1), 20) / tunnelSma(closes.slice(0, index + 1), 20) : null).filter(Number.isFinite);
    const current = widths.at(-1);
    return positive(widths.length < 126 ? null : tunnelPercentile(current, widths.slice(-126)) <= 15, fmt(tunnelPercentile(current, widths.slice(-126)), "pct"), "Bollinger-width percentile over 126 sessions");
  }
  if (id === "T12W_0004") {
    const cleanAtr = atrSeries.filter(Number.isFinite);
    const pct = tunnelPercentile(data.atr14, cleanAtr.slice(-252));
    return positive(cleanAtr.length < 126 ? null : pct <= 20, fmt(pct, "pct"), "ATR14 percentile");
  }
  if (id === "T12W_0005") {
    if (candles.length < 11) return tunnelUnavailable(parameter);
    let count = 0;
    candles.slice(-10).forEach((candle, index) => { const prior = candles[candles.length - 11 + index]; if (candle.high < prior.high && candle.low > prior.low) count += 1; });
    return positive(count >= 5, count, count + " inside bars in last 10");
  }
  if (id === "T12W_0006") return positive(data.high20 === null || data.low20 === null ? null : (Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) / data.close <= 0.08, fmt((Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) / data.close * 100, "%"), "Ten-session base width");
  if (id === "T12W_0007") {
    if (candles.length < 14) return tunnelUnavailable(parameter);
    let above = 0;
    candles.slice(-5).forEach((candle, offset) => {
      const end = candles.length - 5 + offset + 1;
      const mid = (Math.max(...highs.slice(end - 10, end)) + Math.min(...lows.slice(end - 10, end))) / 2;
      if (candle.close > mid) above += 1;
    });
    return positive(above >= 3, above, above + " of last 5 closes above rolling base midpoint");
  }
  if (id === "T12W_0008") return positive(atrSeries.filter(Number.isFinite).length < 3 ? null : atrSeries.at(-1) < atrSeries.at(-2) && atrSeries.at(-2) < atrSeries.at(-3) && tunnelSlope(lows, 5) > 0, fmt(tunnelSlope(lows, 5)), "ATR falling three sessions and five-session low slope " + fmt(tunnelSlope(lows, 5)));
  if (id === "T12W_0009") return positive(vol5 === null || data.vol20 === null ? null : vol5 < data.vol20 * 0.75, fmt(vol5 / data.vol20, "x"), "Five-day volume versus twenty-day average");
  if (id === "T12W_0010") return positive(lastRanges.length < 3 ? null : lastRanges.at(-1) < lastRanges.at(-2) && lastRanges.at(-2) < lastRanges.at(-3) && data.close >= data.low20, fmt(range), "Three contracting ranges without a 10D-low break");
  if (id === "T12W_0011") {
    const deviation = tunnelStdev(closes, 5);
    const mean = tunnelSma(closes, 5);
    return positive(deviation === null || mean === null ? null : deviation / mean <= 0.015, fmt(deviation / mean * 100, "%"), "Five-close cluster deviation");
  }
  if (id === "T12W_0012") return positive(closes.length < 20 ? null : tunnelSlope(closes, 10) > 0 && tunnelStdev(closes, 20) / data.sma20 < 0.04, fmt(tunnelSlope(closes, 10)), "Positive ten-session slope during controlled width");
  if (id === "T12W_0013") return positive(data.high20 === null ? null : data.close >= 0.97 * data.high20 && latest.volume < 2 * data.vol20, fmt((data.high20 - data.close) / data.high20 * 100, "%"), "Distance below twenty-day high");
  if (id === "T12W_0014") return positive(atrSeries.filter(Number.isFinite).length < 5 ? null : Math.abs(tunnelSlope(atrSeries.filter(Number.isFinite), 5)) <= data.close * 0.001, fmt(tunnelSlope(atrSeries.filter(Number.isFinite), 5)), "Five-session ATR slope");
  if (id === "T12W_0015") return positive(data.high20 === null ? null : (data.close / data.high20 - 1) <= -0.02 && (data.close / data.high20 - 1) >= -0.06 && data.close >= data.low20, fmt((data.close / data.high20 - 1) * 100, "%"), "Pullback from ten/twenty-session high");
  if (id === "T12W_0016") return positive(clv.length < 10 ? null : tunnelAverage(clv.slice(-5)) > tunnelAverage(clv.slice(-10, -5)), fmt(tunnelAverage(clv.slice(-5))), "Recent CLV versus prior five sessions");
  if (id === "T12W_0017") return positive(obv.length < 10 || ret10 === null ? null : tunnelSlope(obv, 10) > 0 && Math.abs(ret10) <= 0.03, fmt(tunnelSlope(obv, 10)), "OBV rising while ten-session return is " + fmt(ret10 * 100, "%"));
  if (id === "T12W_0018") return positive(totalVol7 ? (totalVol7 - downVol7) / totalVol7 >= 0.62 : null, fmt(totalVol7 ? (totalVol7 - downVol7) / totalVol7 * 100 : null, "%"), "Seven-session up-volume share");
  if (id === "T12W_0019") return positive(clv.length < 7 ? null : tunnelAverage(clv.slice(-7)) >= 0.65, fmt(tunnelAverage(clv.slice(-7))), "Seven-session average CLV");
  if (id === "T12W_0020") return positive(data.high20 === null || data.vol20 === null ? null : data.close >= data.high20 * 0.98 && latest.volume > 1.3 * data.vol20 && tunnelClv(latest) >= 0.5, fmt(latest.volume / data.vol20, "x"), "Near resistance with volume and midrange hold");
  if (id === "T12W_0021") return positive(vol5 === null || data.vol20 === null || ret10 === null ? null : vol5 > 1.25 * data.vol20 && Math.abs(ret10) < 0.03, fmt(vol5 / data.vol20, "x"), "Volume expanded while price stayed flat");
  if (id === "T12W_0022") return positive(lows.length < 10 ? null : Math.min(...lows.slice(-5)) > Math.min(...lows.slice(-10, -5)) && vol5 <= data.vol20, fmt(Math.min(...lows.slice(-5))), "Recent five-session low above prior five-session low");
  if (id === "T12W_0023") return positive(candles.length < 7 ? null : candles.slice(-7).filter((candle) => (Math.min(candle.open, candle.close) - candle.low) / Math.max(0.0001, candle.high - candle.low) > 0.45).length >= 3, candles.slice(-7).filter((candle) => (Math.min(candle.open, candle.close) - candle.low) / Math.max(0.0001, candle.high - candle.low) > 0.45).length, "Demand-wick count in last seven");
  if (id === "T12W_0024") {
    if (candles.length < 8) return tunnelUnavailable(parameter);
    let count = 0;
    candles.slice(-7).forEach((candle, index) => { const prior = candles[candles.length - 8 + index]; if (candle.low < prior.low && (candle.close > candle.open || tunnelClv(candle) > 0.5)) count += 1; });
    return positive(count >= 2, count, "Same-day recovery count in last seven");
  }
  if (id === "T12W_0026") return positive(data.high20 === null || data.vol20 === null ? null : vol5 / data.vol20 >= 1.15 && vol5 / data.vol20 <= 1.6 && data.close <= data.high20, fmt(vol5 / data.vol20, "x"), "Three/five-day volume preview below breakout");
  if (id === "T12W_0027") {
    const maxGap = candles.length < 11 ? null : Math.max(...candles.slice(-10).map((candle, index) => Math.abs(candle.open / candles[candles.length - 11 + index].close - 1)));
    return positive(maxGap === null ? null : tunnelAverage(clv.slice(-7)) > 0.6 && tunnelSlope(obv, 10) > 0 && maxGap <= 0.03, fmt(maxGap * 100, "%"), "Accumulation without a gap above three percent");
  }
  if (id === "T12W_0028") {
    const recentDown = candles.slice(-5).filter((candle, index, sample) => index && candle.close < sample[index - 1].close).map((candle) => candle.volume);
    const priorDown = candles.slice(-25, -5).filter((candle, index, sample) => index && candle.close < sample[index - 1].close).map((candle) => candle.volume);
    return positive(recentDown.length && priorDown.length ? tunnelAverage(recentDown) < tunnelAverage(priorDown) : null, fmt(tunnelAverage(recentDown)), "Recent down-day volume versus prior twenty sessions");
  }
  if (id === "T12W_0029") return positive(candles.length < 5 ? null : candles.slice(-5).filter((candle) => candle.close > candle.open && tunnelClv(candle) > 0.7).length >= 2 && data.close <= data.high20, candles.slice(-5).filter((candle) => candle.close > candle.open && tunnelClv(candle) > 0.7).length, "Green high-CLV days in current base");
  if (id === "T12W_0030") return positive(data.low20 === null || data.vol20 === null ? null : latest.low <= data.low20 * 1.03 && latest.volume < 0.8 * data.vol20, fmt(latest.volume / data.vol20, "x"), "Support touch with dry volume");
  if (id === "T12W_0031") return positive(candles.length < 10 || ret10 === null ? null : tunnelSlope(candles.map((candle) => tunnelClv(candle) * candle.volume), 5) > 0 && Math.abs(ret10) < 0.03, fmt(tunnelSlope(candles.map((candle) => tunnelClv(candle) * candle.volume), 5)), "CLV-volume pressure rising while price flat");
  if (id === "T12W_0025" || id === "T12W_0032") {
    const flags = [
      tunnelSlope(obv, 10) > 0,
      tunnelAverage(clv.slice(-7)) >= 0.6,
      vol5 !== null && data.vol20 !== null && vol5 >= data.vol20,
      ret10 !== null && Math.abs(ret10) <= 0.04
    ].filter(Boolean).length;
    return positive(candles.length < 20 ? null : flags >= 3, flags, flags + " of four accumulation components");
  }

  if (id === "T12W_0063") return risk(data.high20 === null || data.vol20 === null ? null : vol5 / data.vol20 < 0.7 && data.close >= data.high20 * 0.97, fmt(vol5 / data.vol20, "x"), "Liquidity fade near twenty-day high");
  if (id === "T12W_0064") return risk(totalVol7 && data.vol20 ? downVol7 / totalVol7 > 0.58 && tunnelAverage(volumes.slice(-7)) > data.vol20 : null, fmt(totalVol7 ? downVol7 / totalVol7 * 100 : null, "%"), "Seven-session down-volume share");
  if (id === "T12W_0065") return risk(data.vol20 === null ? null : latest.volume > 1.8 * data.vol20 && (latest.close <= previous.close || tunnelClv(latest) < 0.35), fmt(latest.volume / data.vol20, "x"), "High volume without price progress");
  if (id === "T12W_0066") return risk(!previous || data.vol20 === null ? null : latest.open > previous.high && latest.close < latest.open && latest.volume > 1.5 * data.vol20, fmt(latest.volume / data.vol20, "x"), "Gap-up rejection volume ratio");
  if (id === "T12W_0069") return risk(data.high20Prior === null ? null : latest.high > data.high20Prior && latest.close < data.high20Prior && tunnelClv(latest) < 0.4, fmt(tunnelClv(latest)), "Upthrust above prior resistance and weak close");
  if (id === "T12W_0070") {
    if (candles.length < 25) return tunnelUnavailable(parameter);
    const resistance = Math.max(...highs.slice(-25, -5));
    const broke = candles.slice(-5).some((candle) => candle.close > resistance);
    return risk(broke && latest.close < resistance, fmt(resistance), "Recent breakout then close below resistance");
  }
  if (id === "T12W_0071") return risk(data.high20 === null ? null : latest.high >= data.high20 && tunnelClv(latest) < 0.45, fmt(tunnelClv(latest)), "New-high proximity with negative CLV");
  if (id === "T12W_0072") return risk(data.atr14 === null ? null : range > 1.5 * data.atr14 && latest.close < latest.open && tunnelClv(latest) < 0.3, fmt(range / data.atr14, "x ATR"), "Bearish wide-range close");
  if (id === "T12W_0074") {
    if (data.low20 === null) return tunnelUnavailable(parameter);
    const touches = candles.slice(-15).filter((candle) => candle.low <= data.low20 * 1.02).length;
    return risk(touches >= 3, touches, "Support touches in last fifteen sessions");
  }
  if (id === "T12W_0075") return risk(clv.length < 7 ? null : clv.slice(-7).filter((value) => value < 0.35).length >= 4, clv.slice(-7).filter((value) => value < 0.35).length, "Weak-CLV closes in last seven");
  if (id === "T12W_0076") return risk(closes.length < 30 ? null : data.close >= Math.max(...closes.slice(-14)) && rsiSeries.at(-1) < Math.max(...rsiSeries.slice(-28, -14).filter(Number.isFinite)), fmt(rsiSeries.at(-1)), "Higher price high without RSI confirmation");
  if (id === "T12W_0077") {
    if (data.sma50 === null || candles.length < 10) return tunnelUnavailable(parameter);
    const rejects = candles.slice(-10).filter((candle) => candle.high >= data.sma50 && candle.close < data.sma50).length;
    return risk(rejects >= 2, rejects, "Fifty-day-average rejections in last ten");
  }
  if (id === "T12W_0079") return risk(data.sma20 === null ? null : data.close / data.sma20 > 1.12 && tunnelClv(latest) < 0.4, fmt(data.close / data.sma20, "x"), "Extension above twenty-day mean with weak close");
  if (id === "T12W_0080") return risk(totalVol5 ? downVol5 / totalVol5 >= 0.65 : null, fmt(totalVol5 ? downVol5 / totalVol5 * 100 : null, "%"), "Five-session down-volume share");
  if (id === "T12W_0081") return risk(atrSeries.filter(Number.isFinite).length < 3 || data.sma20 === null ? null : atrSeries.at(-1) > atrSeries.at(-2) && atrSeries.at(-2) > atrSeries.at(-3) && data.close < tunnelSma(closes, 10), fmt(data.atr14), "ATR rising while close is below ten-day average");
  if (id === "T12W_0084") {
    if (candles.length < 8) return tunnelUnavailable(parameter);
    let count = 0;
    candles.slice(-7).forEach((candle, index) => { const prior = candles[candles.length - 8 + index]; if (candle.open > prior.close && candle.close < candle.open) count += 1; });
    return risk(count >= 3, count, "Opening-strength/closing-weakness count");
  }
  if (id === "T12W_0085") return risk(candles.length < 10 ? null : candles.slice(-10).filter((candle) => (candle.high - Math.max(candle.open, candle.close)) / Math.max(0.0001, candle.high - candle.low) > 0.45 && data.high20 && candle.high >= data.high20 * 0.95).length >= 3, candles.slice(-10).filter((candle) => (candle.high - Math.max(candle.open, candle.close)) / Math.max(0.0001, candle.high - candle.low) > 0.45).length, "Supply-wick count near high");

  if (id === "NL01" || id === "NU01") return positive(data.atr14 === null || !row.advisor?.entry_zone ? null : Math.abs(data.close - tunnelAverage(row.advisor.entry_zone)) / data.atr14 <= 0.5, fmt(data.atr14 === null || !row.advisor?.entry_zone ? null : Math.abs(data.close - tunnelAverage(row.advisor.entry_zone)) / data.atr14, " ATR"), "Close versus planned entry zone");
  if (id === "NL02") return positive(data.atr14 === null || !row.stop_price ? null : (data.close - row.stop_price) / data.atr14 >= 0.8 && (data.close - row.stop_price) / data.atr14 <= 2.5, fmt((data.close - row.stop_price) / data.atr14, " ATR"), "Stop distance");
  if (id === "NL03") return positive(!row.target_price || !data.close ? null : (row.target_price - data.close) / data.close >= 0.10, fmt((row.target_price - data.close) / data.close * 100, "%"), "Target room from current close");
  if (id === "NL04") return positive(!row.target_price || !row.stop_price || data.close <= row.stop_price ? null : (row.target_price - data.close) / (data.close - row.stop_price) >= 2, fmt((row.target_price - data.close) / (data.close - row.stop_price), "R"), "Reward-to-risk at scan close");
  if (id === "NL05") return positive(!row.last_candle_date ? null : Math.floor((Date.now() - Date.parse(row.last_candle_date)) / 86400000) <= 3, row.last_candle_date, "Latest candle dated " + row.last_candle_date);
  if (id === "NL06") return risk(!row.stop_price ? null : data.close <= row.stop_price || row.decision === "BLOCKED", data.close, "Stop or hard-gate invalidation state");
  if (id === "NL07") return positive(row.decision ? row.score >= 70 && !["BLOCKED", "DATA_NEEDED"].includes(row.decision) : null, fmt(row.score), "Engine score and hard-gate state");
  if (id === "NL08") {
    const holdingScores = context.holdings.map((item) => tunnelFinite(item.score)).filter(Number.isFinite);
    return positive(!holdingScores.length ? null : row.score - Math.min(...holdingScores) >= 10, fmt(!holdingScores.length ? null : row.score - Math.min(...holdingScores)), "Candidate score edge versus weakest holding");
  }

  if (id === "NT01" || id === "NT02") {
    if (candles.length < 52) return tunnelUnavailable(parameter);
    const conversion = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
    const base = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
    const spanA = (conversion + base) / 2;
    const spanB = (Math.max(...highs.slice(-52)) + Math.min(...lows.slice(-52))) / 2;
    const condition = id === "NT01" ? data.close > Math.max(spanA, spanB) : conversion > base && data.close > Math.max(spanA, spanB);
    return positive(condition, fmt(data.close), "Close " + fmt(data.close) + ", cloud top " + fmt(Math.max(spanA, spanB)) + ", Tenkan " + fmt(conversion) + ", Kijun " + fmt(base));
  }
  if (id === "NT03") {
    if (rsiSeries.filter(Number.isFinite).length < 14) return tunnelUnavailable(parameter);
    const rsi = rsiSeries.filter(Number.isFinite);
    const recent = rsi.slice(-14);
    const min = Math.min(...recent);
    const max = Math.max(...recent);
    const stoch = max === min ? 50 : (rsi.at(-1) - min) / (max - min) * 100;
    return positive(stoch >= 20 && rsi.at(-2) <= 20, fmt(stoch), "Stochastic RSI reclaim");
  }
  if (id === "NT04") {
    const mfi = tunnelMfi(candles);
    return positive(mfi === null ? null : mfi >= 50 && mfi <= 80, fmt(mfi), "MFI14");
  }
  if (id === "NT05") {
    const cmf = tunnelCmf(candles);
    return positive(cmf === null ? null : cmf > 0, fmt(cmf), "CMF20");
  }
  if (id === "NT06") {
    const stdev = tunnelStdev(closes, 20);
    if (stdev === null || data.sma20 === null || data.atr14 === null || data.vol20 === null) return tunnelUnavailable(parameter);
    const upperBb = data.sma20 + 2 * stdev;
    const upperKc = data.sma20 + 1.5 * data.atr14;
    return positive(upperBb <= upperKc && data.close > upperBb && latest.volume / data.vol20 > 1.5, fmt(latest.volume / data.vol20, "x"), "BB/Keltner release with volume");
  }

  if (id === "NMS01") {
    const rank = tunnelPercentile(tunnelFinite(row.return_12m_pct), context.return12);
    return positive(rank === null ? null : rank >= 70, fmt(rank, "pct"), "Twelve-month return rank inside current real scan pool");
  }
  if (id === "NMS03") return positive(candles.length < 65 || !totalVol7 ? null : candles.slice(-65).reduce((sum, candle, index, sample) => sum + (index && candle.close >= sample[index - 1].close ? candle.volume : 0), 0) / Math.max(1, candles.slice(-65).reduce((sum, candle, index, sample) => sum + (index && candle.close < sample[index - 1].close ? candle.volume : 0), 0)) >= 1, null, "Thirteen-week up-volume versus down-volume ratio");
  if (id === "NMS05") {
    if (closes.length < 50) return tunnelUnavailable(parameter);
    const recent = tunnelAverage(closes.slice(-25).map((value, index, sample) => index ? value / sample[index - 1] - 1 : 0));
    const prior = tunnelAverage(closes.slice(-50, -25).map((value, index, sample) => index ? value / sample[index - 1] - 1 : 0));
    return positive(recent > prior, fmt((recent - prior) * 100, "%"), "Recent five-week slope versus prior five weeks");
  }
  if (id === "NMS06") return positive(data.high20Prior === null ? null : Math.abs(data.close - data.high20Prior) / data.high20Prior <= 0.05, fmt(Math.abs(data.close - data.high20Prior) / data.high20Prior * 100, "%"), "Distance from twenty-day pivot");
  if (id === "NMS07") return positive(tunnelSma(volumes, 50) === null ? null : latest.volume / tunnelSma(volumes, 50) >= 1.5, fmt(latest.volume / tunnelSma(volumes, 50), "x"), "Latest volume versus fifty-day average");
  if (id === "NU08") {
    const existing = context.holdings.filter((item) => String(item.sector || "") === String(row.sector || "")).length;
    const total = context.holdings.length + 1;
    return positive(total ? (existing + 1) / total <= 0.25 : null, fmt((existing + 1) / total * 100, "%"), "Sector count share after proposed paper entry");
  }

  return tunnelUnavailable(parameter);
}

function evaluateParameterTunnel(row, context) {
  const data = parameterTunnelData(row);
  const results = PARAMETER_TUNNEL_CATALOG.parameters.map((parameter) => evaluateParameterTunnelNode(parameter, row, data, context));
  const evaluated = results.filter((result) => result.state !== "SOURCE_REQUIRED");
  const positiveHits = results.filter((result) => result.state === "HIT").length;
  const riskClear = results.filter((result) => result.state === "CLEAR").length;
  const riskHits = results.filter((result) => result.state === "RISK").length;
  const misses = results.filter((result) => result.state === "MISS").length;
  const unavailable = results.length - evaluated.length;
  const evidenceScore = evaluated.length ? clamp(((positiveHits + riskClear) / evaluated.length) * 100, 0, 100) : 0;
  return {
    version: PARAMETER_TUNNEL_VERSION,
    total: results.length,
    summary: {
      evaluated: evaluated.length,
      positive_hits: positiveHits,
      risk_clear: riskClear,
      risk_hits: riskHits,
      misses,
      source_required: unavailable,
      coverage_pct: round(evaluated.length / Math.max(1, results.length) * 100, 2),
      evidence_score: round(evidenceScore, 2)
    },
    results
  };
}

function attachParameterTunnel(row, settings, context) {
  const parameterTunnel = evaluateParameterTunnel(row, context);
  const evidenceScore = parameterTunnel.summary.evidence_score;
  const baseScore = tunnelFinite(row.score, 0);
  const hasExecutableEvidence = parameterTunnel.summary.evaluated > 0;
  const blendedScore = ["DATA_NEEDED", "BLOCKED"].includes(row.decision) || !hasExecutableEvidence
    ? baseScore
    : round(baseScore * 0.70 + evidenceScore * 0.30, 2);
  return {
    ...row,
    base_score: baseScore,
    score: blendedScore,
    parameter_tunnel: parameterTunnel,
    parameter_selection_effect: {
      status: hasExecutableEvidence ? "RANKED" : "BASE_SCORE_PRESERVED",
      base_score: baseScore,
      tunnel_score: evidenceScore,
      blended_score: blendedScore,
      hard_gate_decision_preserved: true
    }
  };
}

function parameterTunnelCatalogPublic() {
  return {
    version: PARAMETER_TUNNEL_VERSION,
    total: PARAMETER_TUNNEL_CATALOG.parameters.length,
    stages: PARAMETER_TUNNEL_CATALOG.stages,
    parameters: PARAMETER_TUNNEL_CATALOG.parameters,
    freshness_gate: PARAMETER_TUNNEL_CATALOG.freshnessGate
  };
}
`;

export function applyParameterTunnelPatches(source, mustReplace) {
  let output = mustReplace(
    source,
    "\nfunction runScanner(universe, options = {}) {",
    `\n${PARAMETER_TUNNEL_FUNCTIONS}\nfunction runScanner(universe, options = {}) {`,
    "insert 175-node parameter tunnel"
  );
  output = mustReplace(
    output,
    "  const evaluated = rows.map((row) => evaluateStock(row, { settings, holdings }));\n  const proofRows = applyPortfolio(evaluated, settings).sort(",
    "  const evaluated = rows.map((row) => evaluateStock(row, { settings, holdings }));\n  const tunnelContext = buildParameterTunnelContext(evaluated, holdings);\n  const proofRows = applyPortfolio(evaluated, settings).map((row) => attachParameterTunnel(row, settings, tunnelContext)).sort(",
    "evaluate parameter tunnel on scan rows"
  );
  output = mustReplace(
    output,
    "  return {\n    ok: true,\n    engine: ENGINE_VERSION,\n    asOf,",
    "  const result = {\n    ok: true,\n    engine: ENGINE_VERSION,\n    parameter_tunnel_version: PARAMETER_TUNNEL_VERSION,\n    asOf,",
    "scanner result variable"
  );
  output = mustReplace(
    output,
    "    rows: proofRows\n  };\n}\n\nfunction decisionRank",
    "    rows: proofRows\n  };\n  latestParameterTunnelScan = result;\n  return result;\n}\n\nfunction decisionRank",
    "cache latest parameter scan"
  );
  output = mustReplace(
    output,
    "          parameters: SCANNER_PARAMETERS,\n          universe: state.universe,",
    "          parameters: SCANNER_PARAMETERS,\n          parameter_tunnel: parameterTunnelCatalogPublic(),\n          universe: state.universe,",
    "publish parameter tunnel catalog"
  );
  output = mustReplace(
    output,
    "return { rank: index + 1, symbol: row.symbol, name: row.name, sector:",
    "return { rank: index + 1, symbol: row.symbol, instrument_key: row.instrument_key, parameter_tunnel: row.parameter_tunnel || null, parameter_selection_effect: row.parameter_selection_effect || null, name: row.name, sector:",
    "carry parameter evidence into paper buy ticket"
  );
  return output;
}

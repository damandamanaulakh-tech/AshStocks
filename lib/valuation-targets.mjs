// Pure, dependency-free scenario mathematics. These assumptions are not live
// fundamentals, calibrated forecasts, scanner SELECT decisions or sell orders.
export const VALUATION_MODEL_VERSION = "ashstocks-valuation-targets-v1.0";

export const VALUATION_FORMULAS = Object.freeze({
  annual_eps_basis: "Assumed normalised annual earnings per share; never quarterly EPS",
  base_pe_mid: "base_pe_low + (base_pe_high - base_pe_low) / 2",
  base_12m_low: "annual_eps * base_pe_low",
  base_12m_mid: "annual_eps * (base_pe_low + (base_pe_high - base_pe_low) / 2)",
  base_12m_high: "annual_eps * base_pe_high",
  target_3m: "reference_price + (base_12m_price - reference_price) * 3 / 12",
  target_9m: "reference_price + (base_12m_price - reference_price) * 9 / 12",
  target_12m: "reference_price + (base_12m_price - reference_price) * 12 / 12",
  upside_pct: "(target_price / reference_price - 1) * 100",
  bear_12m: "bear_eps * bear_pe",
  bull_12m: "bull_eps * bull_pe, only when both assumptions are explicitly supplied",
  due_date: "Frozen reference_date plus 3, 9 or 12 calendar months; clamp to month end",
  sell_price: "Selected horizon low/mid/high rounded upward to an internal INR 0.01 paper-trigger grid by default; not an exchange-order tick",
  interpretation: "3M and 9M are interpolated valuation markers, not independent forecasts or forced-sale dates"
});

const VALUATION_HORIZONS = Object.freeze([3, 9, 12]);
const VALUATION_SOURCE_TYPES = Object.freeze(["analyst_assumption", "user_assumption"]);
const VALUATION_DAY_MS = 86400000;

function valuationIsRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valuationPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function valuationValidDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 9998) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function valuationEvaluationDay(now) {
  if (typeof now === "string" && /^\d{4}-\d{2}-\d{2}$/.test(now)) {
    return valuationValidDay(now) ? now : null;
  }
  if (now === null || typeof now === "boolean" || (typeof now === "string" && !now.trim())) return null;
  try {
    const instant = new Date(now === undefined ? Date.now() : now);
    if (!Number.isFinite(instant.getTime())) return null;
    // Deadlines use the market's calendar date, not the server's local timezone.
    const shifted = new Date(instant.getTime() + 330 * 60 * 1000);
    if (!Number.isFinite(shifted.getTime())) return null;
    const marketDay = shifted.toISOString().slice(0, 10);
    return valuationValidDay(marketDay) ? marketDay : null;
  } catch {
    return null;
  }
}

function valuationAddDays(day, days) {
  return new Date(Date.parse(day + "T00:00:00.000Z") + days * VALUATION_DAY_MS).toISOString().slice(0, 10);
}

function valuationAddMonths(day, months) {
  const [year, month, date] = day.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date, lastDay));
  return first.toISOString().slice(0, 10);
}

function valuationSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return value.trim();
  } catch {
    return null;
  }
}

/** Validate input without inventing earnings, multiples, prices or provenance. */
export function validateValuationAssumption(input, { now } = {}) {
  const errors = [];
  const day = valuationEvaluationDay(now);
  if (!day) errors.push("evaluation_date_invalid");
  if (!valuationIsRecord(input)) return { ok: false, errors: [...errors, "assumption_record_required"], assumption: null };

  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const isin = typeof input.isin === "string" ? input.isin.trim().toUpperCase() : "";
  const instrumentKey = typeof input.instrument_key === "string" ? input.instrument_key.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9&._-]{0,49}$/.test(symbol)) errors.push("symbol_invalid");
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) errors.push("isin_invalid");
  if (!/^NSE_EQ\|[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(instrumentKey)) errors.push("instrument_key_invalid");
  if (isin && instrumentKey !== "NSE_EQ|" + isin) errors.push("instrument_key_isin_mismatch");

  for (const field of ["reference_price", "annual_eps", "base_pe_low", "base_pe_high", "bear_eps", "bear_pe"]) {
    if (!valuationPositiveNumber(input[field])) errors.push(field + "_positive_number_required");
  }
  if (valuationPositiveNumber(input.base_pe_low) && valuationPositiveNumber(input.base_pe_high) && input.base_pe_low > input.base_pe_high) {
    errors.push("base_pe_range_reversed");
  }
  if (input.eps_basis !== "normalised_annual") errors.push("eps_basis_normalised_annual_required");

  const hasBullEps = input.bull_eps !== undefined && input.bull_eps !== null;
  const hasBullPe = input.bull_pe !== undefined && input.bull_pe !== null;
  if (hasBullEps !== hasBullPe) errors.push("bull_eps_and_pe_required_together");
  if (hasBullEps && !valuationPositiveNumber(input.bull_eps)) errors.push("bull_eps_positive_number_required");
  if (hasBullPe && !valuationPositiveNumber(input.bull_pe)) errors.push("bull_pe_positive_number_required");

  for (const field of ["reference_date", "as_of"]) {
    if (!valuationValidDay(input[field])) errors.push(field + "_invalid");
    else if (day && input[field] > day) errors.push(field + "_future");
  }
  if (valuationValidDay(input.reference_date) && valuationValidDay(input.as_of) && input.reference_date > input.as_of) {
    errors.push("reference_date_after_as_of");
  }
  const validUntil = input.valid_until === undefined && valuationValidDay(input.as_of)
    ? valuationAddDays(input.as_of, 120)
    : input.valid_until;
  if (!valuationValidDay(validUntil)) errors.push("valid_until_invalid");
  else if (valuationValidDay(input.as_of) && validUntil < input.as_of) errors.push("valid_until_before_as_of");

  if (!VALUATION_SOURCE_TYPES.includes(input.source_type)) errors.push("source_type_invalid");
  const sourceUrls = [];
  if (!Array.isArray(input.source_urls) || input.source_urls.length > 20) errors.push("source_urls_array_required_max_20");
  else {
    for (const source of input.source_urls) {
      const url = valuationSourceUrl(source);
      if (!url) errors.push("source_url_invalid");
      else if (!sourceUrls.includes(url)) sourceUrls.push(url);
    }
  }
  if (input.source_type === "analyst_assumption" && !sourceUrls.length) errors.push("analyst_source_url_required");
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length < 3 || notes.length > 4000) errors.push("assumption_notes_required_max_4000");
  const actionBasis = typeof input.corporate_action_basis === "string" ? input.corporate_action_basis.trim() : "";
  if (actionBasis.length > 1000) errors.push("corporate_action_basis_too_long");
  if (input.corporate_action_reviewed !== undefined && typeof input.corporate_action_reviewed !== "boolean") {
    errors.push("corporate_action_reviewed_boolean_required");
  }
  if (input.corporate_action_reviewed === true && !actionBasis) errors.push("corporate_action_basis_required_for_review");

  for (const [left, right, label] of [
    [input.annual_eps, input.base_pe_low, "base_low"],
    [input.annual_eps, input.base_pe_high, "base_high"],
    [input.bear_eps, input.bear_pe, "bear"],
    ...(hasBullEps && hasBullPe ? [[input.bull_eps, input.bull_pe, "bull"]] : [])
  ]) {
    if (valuationPositiveNumber(left) && valuationPositiveNumber(right) && !valuationPositiveNumber(left * right)) {
      errors.push(label + "_valuation_not_finite_positive");
    }
    if (label.startsWith("base_") && valuationPositiveNumber(left * right) && valuationPositiveNumber(input.reference_price)
      && !Number.isFinite(((left * right) / input.reference_price - 1) * 100)) {
      errors.push(label + "_upside_not_finite");
    }
  }

  const assumption = {
    symbol,
    instrument_key: instrumentKey,
    isin,
    reference_price: valuationPositiveNumber(input.reference_price) ? input.reference_price : null,
    reference_date: typeof input.reference_date === "string" ? input.reference_date : null,
    as_of: typeof input.as_of === "string" ? input.as_of : null,
    annual_eps: valuationPositiveNumber(input.annual_eps) ? input.annual_eps : null,
    eps_basis: input.eps_basis === "normalised_annual" ? input.eps_basis : null,
    base_pe_low: valuationPositiveNumber(input.base_pe_low) ? input.base_pe_low : null,
    base_pe_high: valuationPositiveNumber(input.base_pe_high) ? input.base_pe_high : null,
    bear_eps: valuationPositiveNumber(input.bear_eps) ? input.bear_eps : null,
    bear_pe: valuationPositiveNumber(input.bear_pe) ? input.bear_pe : null,
    ...(hasBullEps || hasBullPe ? {
      bull_eps: valuationPositiveNumber(input.bull_eps) ? input.bull_eps : null,
      bull_pe: valuationPositiveNumber(input.bull_pe) ? input.bull_pe : null
    } : {}),
    source_type: VALUATION_SOURCE_TYPES.includes(input.source_type) ? input.source_type : null,
    source_urls: sourceUrls,
    notes,
    corporate_action_basis: actionBasis,
    corporate_action_reviewed: input.corporate_action_reviewed === true,
    valid_until: typeof validUntil === "string" ? validUntil : null
  };
  return { ok: errors.length === 0, errors: [...new Set(errors)], assumption };
}

/** Return raw-precision scenarios. Formatting must not mutate these values. */
export function calculateValuationTargets(input, { now } = {}) {
  const validation = validateValuationAssumption(input, { now });
  const day = valuationEvaluationDay(now);
  const result = {
    status: "DATA_NEEDED",
    model_version: VALUATION_MODEL_VERSION,
    assumption: validation.assumption,
    evaluated_at: day,
    targets: [],
    bear_12m: null,
    bull_12m: null,
    warnings: [],
    errors: validation.errors,
    activation_allowed: false
  };
  if (!validation.ok) {
    const nonPositive = ["annual_eps", "base_pe_low", "base_pe_high", "bear_eps", "bear_pe", "bull_eps", "bull_pe"]
      .some((field) => typeof input?.[field] === "number" && Number.isFinite(input[field]) && input[field] <= 0);
    if (nonPositive) result.status = "NOT_APPLICABLE";
    result.warnings.push("Valuation inputs are incomplete or invalid. No earnings, multiples or targets have been invented.");
    return result;
  }
  const assumption = validation.assumption;
  const baseLow = assumption.annual_eps * assumption.base_pe_low;
  const baseHigh = assumption.annual_eps * assumption.base_pe_high;
  const baseMid = assumption.annual_eps * (assumption.base_pe_low + (assumption.base_pe_high - assumption.base_pe_low) / 2);
  const stale = day > assumption.valid_until;
  const reviewed = assumption.corporate_action_reviewed;
  result.warnings.push("Analyst/user valuation assumptions, not company guidance, validated AshStock forecasts, scanner eligibility or sell orders.");
  result.warnings.push("3M and 9M values are linear interpolation from the frozen reference; actual prices will not follow a straight path.");
  if (!reviewed) result.warnings.push("Corporate-action and annual EPS basis review is pending; target activation is blocked.");
  if (stale) result.warnings.push("The assumption has expired; preserve these historical values but review a new revision before activation.");
  if (baseLow <= assumption.reference_price) result.warnings.push("At least one base target is at or below the reference price. This is a downside/review scenario, not an automatic take-profit instruction.");
  result.targets = VALUATION_HORIZONS.map((months) => {
    const dueDate = valuationAddMonths(assumption.reference_date, months);
    const low = months === 12 ? baseLow : assumption.reference_price + (baseLow - assumption.reference_price) * months / 12;
    const mid = months === 12 ? baseMid : assumption.reference_price + (baseMid - assumption.reference_price) * months / 12;
    const high = months === 12 ? baseHigh : assumption.reference_price + (baseHigh - assumption.reference_price) * months / 12;
    const due = dueDate <= day;
    return {
      months,
      due_date: dueDate,
      low,
      mid,
      high,
      upside_low_pct: (low / assumption.reference_price - 1) * 100,
      upside_mid_pct: (mid / assumption.reference_price - 1) * 100,
      upside_high_pct: (high / assumption.reference_price - 1) * 100,
      activation_allowed: reviewed && !stale && !due,
      ...(due ? { activation_reason: "horizon_already_due" }
        : stale ? { activation_reason: "assumption_expired" }
          : !reviewed ? { activation_reason: "corporate_action_review_required" } : {})
    };
  });
  const expiredHorizons = result.targets.filter((target) => target.due_date <= day).map((target) => target.months);
  if (expiredHorizons.length) result.warnings.push("Already-due horizons cannot be activated: " + expiredHorizons.join(", ") + " months.");
  result.bear_12m = assumption.bear_eps * assumption.bear_pe;
  result.bull_12m = assumption.bull_eps !== undefined ? assumption.bull_eps * assumption.bull_pe : null;
  result.activation_allowed = result.targets.some((target) => target.activation_allowed);
  result.status = result.activation_allowed ? "READY" : "REVIEW_REQUIRED";
  return result;
}

/** Select an internal paper trigger, not an exchange order. Server must also
 * check a fresh executable quote, held quantity, entry-price/profit policy and
 * explicit user activation. The default INR 0.01 grid rounds upward; it does not
 * claim to represent an instrument's permitted exchange-order tick size. */
export function chooseValuationTarget(result, horizon, policy, tickSize = 0.01) {
  const failure = (reason) => ({ ok: false, price: null, months: horizon, policy, reason });
  if (!VALUATION_HORIZONS.includes(horizon)) return failure("horizon_must_be_3_9_or_12");
  if (!["low", "mid", "high"].includes(policy)) return failure("policy_must_be_low_mid_or_high");
  if (!valuationPositiveNumber(tickSize) || tickSize < 0.000001 || tickSize > 1000000) return failure("tick_size_invalid");
  if (!valuationIsRecord(result) || result.model_version !== VALUATION_MODEL_VERSION || !valuationValidDay(result.evaluated_at)) {
    return failure("valuation_result_invalid");
  }
  // Recalculate from the recorded assumptions to reject a tampered target or
  // forged activation flag. This is deterministic at the recorded evaluation
  // date; the server must calculate again with its current clock on activation.
  const checked = calculateValuationTargets(result.assumption, { now: result.evaluated_at });
  const target = checked.targets.find((candidate) => candidate.months === horizon);
  if (!target || !checked.activation_allowed) return failure(target?.activation_reason || "valuation_review_required");
  if (!target.activation_allowed) return failure(target.activation_reason || "horizon_activation_blocked");
  const rawPrice = target[policy];
  if (!valuationPositiveNumber(rawPrice)) return failure("target_price_invalid");
  const units = rawPrice / tickSize;
  if (!Number.isFinite(units) || units > Number.MAX_SAFE_INTEGER) return failure("target_tick_precision_unsupported");
  // Suppress floating-point noise only when a value is already on a tick.
  const nearest = Math.round(units);
  const noise = 4 * Number.EPSILON * Math.max(1, Math.abs(units));
  const ticks = Math.abs(units - nearest) <= noise ? nearest : Math.ceil(units);
  const price = Number((ticks * tickSize).toFixed(8));
  if (!valuationPositiveNumber(price)) return failure("target_tick_precision_unsupported");
  return { ok: true, price, months: horizon, policy };
}

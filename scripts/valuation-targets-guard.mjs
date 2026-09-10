import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {
  VALUATION_MODEL_VERSION,
  VALUATION_FORMULAS,
  validateValuationAssumption,
  calculateValuationTargets,
  chooseValuationTarget
} from "../lib/valuation-targets.mjs";

// Pure tests only: no server import, network, credentials, database or orders.
const NOW = "2026-09-09";
const fixture = {
  symbol: "BSOFT",
  instrument_key: "NSE_EQ|INE836A01035",
  isin: "INE836A01035",
  reference_price: 100,
  reference_date: NOW,
  as_of: NOW,
  annual_eps: 10,
  eps_basis: "normalised_annual",
  base_pe_low: 12,
  base_pe_high: 16,
  bear_eps: 8,
  bear_pe: 10,
  source_type: "analyst_assumption",
  source_urls: ["https://www.birlasoft.com/investors"],
  notes: "Deterministic analyst-assumption fixture, not real market input.",
  corporate_action_basis: "Test fixture: reference and annual EPS use the same reviewed share basis.",
  corporate_action_reviewed: true
};
const calculate = (changes = {}, now = NOW) => calculateValuationTargets({ ...fixture, ...changes }, { now });
const approximate = (actual, expected, message) => assert.ok(
  Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)),
  `${message || "value"}: expected ${expected}, received ${actual}`
);
const validationHas = (changes, error, now = NOW) => {
  const result = validateValuationAssumption({ ...fixture, ...changes }, { now });
  assert.equal(result.ok, false, `Input must reject: ${error}`);
  assert.ok(result.errors.includes(error), `Expected ${error}; received ${result.errors.join(", ")}`);
  const computed = calculate(changes, now);
  assert.equal(computed.activation_allowed, false);
  assert.deepEqual(computed.targets, [], "Invalid inputs must never produce fallback targets");
  assert.equal(chooseValuationTarget(computed, 12, "mid").ok, false);
};

assert.match(VALUATION_MODEL_VERSION, /^ashstocks-valuation-targets-v/);
assert.equal(Object.isFrozen(VALUATION_FORMULAS), true);
for (const field of ["base_pe_mid", "base_12m_low", "base_12m_mid", "base_12m_high", "target_3m", "target_9m", "target_12m", "upside_pct", "bear_12m", "bull_12m"]) {
  assert.equal(typeof VALUATION_FORMULAS[field], "string", `Formula ${field} must be visible`);
}
assert.match(VALUATION_FORMULAS.sell_price, /internal INR 0\.01/);
assert.match(VALUATION_FORMULAS.sell_price, /not an exchange-order tick/);

const validated = validateValuationAssumption(fixture, { now: NOW });
assert.equal(validated.ok, true);
assert.deepEqual(validated.errors, []);
assert.equal(validated.assumption.valid_until, "2027-01-07", "Default validity is as_of plus 120 calendar days");
const plain = calculate();
assert.equal(plain.status, "READY");
assert.equal(plain.model_version, VALUATION_MODEL_VERSION);
assert.equal(plain.activation_allowed, true);
assert.equal(plain.bear_12m, 80);
assert.equal(plain.bull_12m, null, "Do not invent a bull scenario");
assert.deepEqual(plain.targets.map(({ months, due_date, low, mid, high }) => [months, due_date, low, mid, high]), [
  [3, "2026-12-09", 105, 110, 115],
  [9, "2027-06-09", 115, 130, 145],
  [12, "2027-09-09", 120, 140, 160]
]);
for (const target of plain.targets) {
  for (const policy of ["low", "mid", "high"]) {
    approximate(target[`upside_${policy}_pct`], (target[policy] / fixture.reference_price - 1) * 100, "upside formula");
  }
  assert.ok(target.low <= target.mid && target.mid <= target.high);
  assert.equal(target.activation_allowed, true);
}
assert.equal(calculate({ bull_eps: 12, bull_pe: 18 }).bull_12m, 216);
assert.equal(calculate({ bull_eps: null, bull_pe: null }).bull_12m, null);
assert.equal(calculate({ source_type: "user_assumption", source_urls: [] }).status, "READY", "An explicit user assumption may have no external source URL");
console.log("Valuation formulas passed: annual EPS x base P/E, 3/9/12 interpolation, upside and explicit bear/bull.");

// Unknown fields do not become operating instructions. Inputs are copied and
// sanitised, never mutated, and refreshes do not move their reference anchors.
const frozen = Object.freeze({ ...fixture, source_urls: Object.freeze([...fixture.source_urls]), automatic_sell: true });
const frozenBefore = JSON.stringify(frozen);
const frozenResult = calculateValuationTargets(frozen, { now: NOW });
assert.equal(JSON.stringify(frozen), frozenBefore);
assert.equal(Object.hasOwn(frozenResult.assumption, "automatic_sell"), false);
frozenResult.assumption.source_urls.push("https://example.com/another-source");
assert.equal(fixture.source_urls.length, 1);
const refreshed = calculate({}, "2026-10-01");
assert.equal(refreshed.assumption.reference_date, NOW);
assert.equal(refreshed.assumption.reference_price, 100);
assert.deepEqual(refreshed.targets, plain.targets, "A quote-clock refresh must not move values or deadlines");
const normalised = validateValuationAssumption({ ...fixture, symbol: " bsoft ", isin: " ine836a01035 ", instrument_key: " nse_eq|ine836a01035 " }, { now: NOW });
assert.equal(normalised.ok, true);
assert.equal(normalised.assumption.instrument_key, fixture.instrument_key);
assert.equal(normalised.assumption.symbol, fixture.symbol);

for (const field of ["reference_price", "annual_eps", "base_pe_low", "base_pe_high", "bear_eps", "bear_pe"]) {
  for (const value of [null, undefined, "", "10", NaN, Infinity, -Infinity, true, false, 0, -1]) {
    validationHas({ [field]: value }, `${field}_positive_number_required`);
  }
}
assert.equal(calculate({ annual_eps: -17.12 }).status, "NOT_APPLICABLE", "Loss-making reported EPS is not a usable P/E target");
assert.equal(calculate({ annual_eps: 0 }).status, "NOT_APPLICABLE");
assert.equal(calculate({ annual_eps: null }).status, "DATA_NEEDED");
validationHas({ base_pe_low: 17, base_pe_high: 16 }, "base_pe_range_reversed");
validationHas({ eps_basis: "quarterly" }, "eps_basis_normalised_annual_required");
validationHas({ eps_basis: "trailing_reported" }, "eps_basis_normalised_annual_required");
validationHas({ annual_eps: Number.MAX_VALUE, base_pe_high: 2 }, "base_high_valuation_not_finite_positive");
validationHas({ annual_eps: Number.MIN_VALUE, base_pe_low: 0.1 }, "base_low_valuation_not_finite_positive");
validationHas({ reference_price: Number.MIN_VALUE }, "base_low_upside_not_finite");
validationHas({ bull_eps: 12 }, "bull_eps_and_pe_required_together");
validationHas({ bull_pe: 18 }, "bull_eps_and_pe_required_together");
validationHas({ bull_eps: 0, bull_pe: 18 }, "bull_eps_positive_number_required");
validationHas({ bull_eps: 12, bull_pe: -1 }, "bull_pe_positive_number_required");
assert.equal(validateValuationAssumption(null, { now: NOW }).ok, false);
assert.equal(validateValuationAssumption([], { now: NOW }).ok, false);

validationHas({ symbol: "" }, "symbol_invalid");
validationHas({ symbol: "<script>" }, "symbol_invalid");
validationHas({ isin: "INE836A0103" }, "isin_invalid");
validationHas({ instrument_key: "BSE_EQ|INE836A01035" }, "instrument_key_invalid");
validationHas({ isin: "INE520A01027" }, "instrument_key_isin_mismatch");
validationHas({ source_type: "company_guidance" }, "source_type_invalid");
validationHas({ source_urls: [] }, "analyst_source_url_required");
validationHas({ source_urls: "https://example.com" }, "source_urls_array_required_max_20");
validationHas({ source_urls: Array(21).fill("https://example.com") }, "source_urls_array_required_max_20");
for (const source of ["javascript:alert(1)", "file:///tmp/private", "https://user:password@example.com", "not a URL", null]) {
  validationHas({ source_urls: [source] }, "source_url_invalid");
}
assert.equal(validateValuationAssumption({ ...fixture, source_urls: [...fixture.source_urls, ...fixture.source_urls] }, { now: NOW }).assumption.source_urls.length, 1);
validationHas({ notes: "" }, "assumption_notes_required_max_4000");
validationHas({ notes: "x".repeat(4001) }, "assumption_notes_required_max_4000");
validationHas({ corporate_action_reviewed: "true" }, "corporate_action_reviewed_boolean_required");
validationHas({ corporate_action_basis: "", corporate_action_reviewed: true }, "corporate_action_basis_required_for_review");
console.log("Valuation input guards passed: no invented fallback, annual basis, identity and explicit provenance.");

// Calendar-month arithmetic must clamp directly from the frozen reference.
const dateCases = [
  ["2024-01-31", ["2024-04-30", "2024-10-31", "2025-01-31"]],
  ["2023-11-30", ["2024-02-29", "2024-08-30", "2024-11-30"]],
  ["2024-02-29", ["2024-05-29", "2024-11-29", "2025-02-28"]],
  ["2025-11-30", ["2026-02-28", "2026-08-30", "2026-11-30"]]
];
for (const [day, expectedDates] of dateCases) {
  const dated = calculate({ reference_date: day, as_of: day }, day);
  assert.equal(dated.status, "READY");
  assert.deepEqual(dated.targets.map((target) => target.due_date), expectedDates);
}
for (const field of ["reference_date", "as_of", "valid_until"]) {
  for (const day of [null, "", "2026-02-29", "2026-04-31", "2026-13-01", "2026-9-09", "September 9 2026", "2026-09-09T00:00:00Z"]) {
    validationHas({ [field]: day }, `${field}_invalid`);
  }
}
validationHas({ as_of: "2026-09-10" }, "as_of_future");
validationHas({ reference_date: "2026-09-10" }, "reference_date_future");
validationHas({ as_of: "2026-09-08" }, "reference_date_after_as_of");
validationHas({ valid_until: "2026-09-08" }, "valid_until_before_as_of");
for (const badNow of [null, false, "", "garbage", "2026-02-29", new Date(NaN), new Date(8640000000000000), Symbol("invalid-date")]) {
  validationHas({}, "evaluation_date_invalid", badNow);
}
assert.equal(calculate({}, "2026-09-08T18:29:59.999Z").activation_allowed, false, "Future assumptions must be rejected before the IST date changes");
assert.equal(calculate({}, "2026-09-08T18:30:00.000Z").status, "READY");
assert.equal(calculate({}, new Date("2026-09-08T18:30:00.000Z")).evaluated_at, NOW);

const pending = calculate({ corporate_action_reviewed: undefined });
assert.equal(pending.assumption.corporate_action_reviewed, false, "Corporate-action review must default to false");
assert.equal(pending.status, "REVIEW_REQUIRED");
assert.equal(pending.activation_allowed, false);
assert.equal(pending.targets.length, 3, "Review pending should not hide valid scenario mathematics");
assert.equal(pending.targets[2].low, 120);
assert.equal(chooseValuationTarget(pending, 12, "low").reason, "corporate_action_review_required");
assert.equal(calculate({ corporate_action_reviewed: false, corporate_action_basis: "" }).targets.length, 3);

const due = calculate({}, "2026-12-09");
assert.equal(due.activation_allowed, true, "An upcoming horizon may remain available while 3M is due");
assert.equal(due.targets[0].activation_allowed, false);
assert.equal(chooseValuationTarget(due, 3, "mid").reason, "horizon_already_due");
assert.equal(chooseValuationTarget(due, 9, "mid").ok, true);
assert.equal(calculate({}, "2026-12-08").targets[0].activation_allowed, true);
assert.equal(calculate({}, "2027-01-07").activation_allowed, true, "valid_until is inclusive on the market calendar date");
const stale = calculate({}, "2027-01-08");
assert.equal(stale.status, "REVIEW_REQUIRED");
assert.equal(stale.activation_allowed, false);
assert.equal(stale.targets[2].high, 160, "Stale assumptions retain historical scenario values");
assert.equal(chooseValuationTarget(stale, 12, "mid").reason, "assumption_expired");
const allDue = calculate({ valid_until: "2028-01-01" }, "2027-09-09");
assert.equal(allDue.activation_allowed, false);
assert.equal(chooseValuationTarget(allDue, 12, "mid").reason, "horizon_already_due");
console.log("Valuation calendar and review guards passed: frozen anchors, month-end/leap-year dates, IST, expiry and per-horizon blocking.");

// Choosing a scenario does not grant trading permission or trust a mutated
// computed payload. Activation still requires a fresh server recalculation.
assert.deepEqual(chooseValuationTarget(plain, 12, "low"), { ok: true, price: 120, months: 12, policy: "low" });
assert.deepEqual(chooseValuationTarget(plain, 9, "mid"), { ok: true, price: 130, months: 9, policy: "mid" });
assert.deepEqual(chooseValuationTarget(plain, 3, "high"), { ok: true, price: 115, months: 3, policy: "high" });
for (const horizon of [0, 6, 15, "3", null, NaN]) assert.equal(chooseValuationTarget(plain, horizon, "mid").ok, false);
for (const policy of ["base", "LOW", "bear", null, 0]) assert.equal(chooseValuationTarget(plain, 12, policy).ok, false);
for (const tick of [null, "0.01", 0, -1, NaN, Infinity, 0.0000001, 1000001]) assert.equal(chooseValuationTarget(plain, 12, "low", tick).ok, false);
const fractional = calculate({ annual_eps: 10.1234, base_pe_low: 1.17, base_pe_high: 1.93 });
const fractionalRaw = fractional.targets[2].low;
assert.notEqual(fractionalRaw, Number(fractionalRaw.toFixed(2)), "Scenario calculation must retain raw precision");
assert.equal(chooseValuationTarget(fractional, 12, "low").price, 11.85, "Default paper-trigger grid is INR 0.01 rounded up");
assert.equal(chooseValuationTarget(fractional, 12, "low", 0.05).price, 11.85);
assert.equal(chooseValuationTarget(fractional, 12, "low", 0.1).price, 11.9);
assert.equal(chooseValuationTarget(fractional, 12, "low", 0.25).price, 12);
assert.equal(chooseValuationTarget(fractional, 12, "low", 0.03).price, 11.85);
for (const tick of [0.01, 0.05, 0.1, 0.25, 0.03]) {
  const chosen = chooseValuationTarget(fractional, 12, "low", tick);
  assert.ok(chosen.price >= fractionalRaw);
  assert.ok(chosen.price < fractionalRaw + tick + 1e-10);
  approximate(chosen.price / tick, Math.round(chosen.price / tick), "Grid-aligned trigger");
}
assert.equal(chooseValuationTarget(calculate({ annual_eps: 0.7, base_pe_low: 0.1, base_pe_high: 0.2 }), 12, "low").price, 0.07, "Already aligned price must not drift by an extra tick");
const forgedTargets = structuredClone(plain);
forgedTargets.targets[2].mid = 999999;
assert.equal(chooseValuationTarget(forgedTargets, 12, "mid").price, 140, "Choice must recalculate rather than trust client-supplied target values");
const forgedReview = structuredClone(pending);
forgedReview.activation_allowed = true;
forgedReview.status = "READY";
forgedReview.targets.forEach((target) => { target.activation_allowed = true; });
assert.equal(chooseValuationTarget(forgedReview, 12, "mid").ok, false, "Forged activation flags cannot bypass unreviewed assumptions");
assert.equal(chooseValuationTarget({ ...plain, model_version: "unknown" }, 12, "mid").ok, false);
assert.equal(chooseValuationTarget({ ...plain, evaluated_at: "invalid" }, 12, "mid").ok, false);
assert.equal(chooseValuationTarget(null, 12, "mid").ok, false);
const downward = calculate({ annual_eps: 5, base_pe_low: 12, base_pe_high: 16 });
assert.equal(downward.targets[2].low, 60, "Do not clamp downside valuation back into artificial upside");
assert.ok(downward.targets[2].upside_low_pct < 0);
assert.ok(downward.warnings.some((warning) => /not an automatic take-profit/.test(warning)));
assert.equal(Object.hasOwn(downward, "sell_order"), false);
assert.equal(Object.hasOwn(downward, "scanner_decision"), false);
console.log("Valuation selection guards passed: raw precision, explicit policy, upward INR trigger rounding and tamper-resistant selection.");

const seed = JSON.parse(await fs.readFile(new URL("../data/valuation-assumptions-2026-09-09.json", import.meta.url), "utf8"));
assert.equal(seed.schema_version, "1.0");
assert.equal(seed.as_of, NOW);
assert.equal(seed.assumptions.length, 12);
assert.match(seed.description, /not reported EPS/);
assert.match(seed.description, /No corporate-action basis is approved/);
const expected = {
  BBL: ["INE464A01036", 2288, 110, 22, 25, 85, 19, 2420, 2750],
  LATENTVIEW: ["INE0I7C01011", 263, 11, 25, 29, 8.5, 22, 275, 319],
  JWL: ["INE209L01016", 247, 4.5, 38, 48, 3, 35, 171, 216],
  RAILTEL: ["INE0DD101019", 271, 12, 23, 27, 9, 20, 276, 324],
  KEC: ["INE389H01022", 406, 24, 18, 22, 15, 16, 432, 528],
  TRANSRAILL: ["INE454P01035", 433, 34, 14, 16, 26, 11, 476, 544],
  GODFRYPHLP: ["INE260B01028", 2040, 75, 24, 28, 50, 22, 1800, 2100],
  BSOFT: ["INE836A01035", 285, 23, 14, 17, 18, 11, 322, 391],
  ZENSARTECH: ["INE520A01027", 455, 36, 14, 17, 29, 11, 504, 612],
  RHIM: ["INE743M01012", 371, 12.5, 26, 30, 8, 22, 325, 375],
  SURYAROSNI: ["INE335A01020", 217, 16, 15, 18, 12, 11, 240, 288],
  THERMAX: ["INE152A01029", 3630, 65, 48, 56, 45, 40, 3120, 3640]
};
assert.equal(new Set(seed.assumptions.map((row) => row.symbol)).size, 12);
assert.equal(new Set(seed.assumptions.map((row) => row.instrument_key)).size, 12);
for (const row of seed.assumptions) {
  const [isin, reference, eps, peLow, peHigh, bearEps, bearPe, low, high] = expected[row.symbol];
  assert.deepEqual([row.isin, row.reference_price, row.annual_eps, row.base_pe_low, row.base_pe_high, row.bear_eps, row.bear_pe], [isin, reference, eps, peLow, peHigh, bearEps, bearPe]);
  assert.equal(row.instrument_key, "NSE_EQ|" + isin);
  assert.equal(row.source_type, "analyst_assumption");
  assert.equal(row.corporate_action_reviewed, false);
  assert.equal(row.reference_date, NOW);
  assert.equal(row.as_of, NOW);
  const computed = calculateValuationTargets(row, { now: NOW });
  assert.deepEqual(computed.errors, [], row.symbol + " seed validation");
  assert.equal(computed.status, "REVIEW_REQUIRED");
  assert.equal(computed.activation_allowed, false);
  assert.equal(computed.targets[2].low, low);
  assert.equal(computed.targets[2].high, high);
  assert.equal(computed.bear_12m, bearEps * bearPe);
  assert.equal(computed.bull_12m, null);
  assert.equal(chooseValuationTarget(computed, 12, "low").ok, false);
  for (const target of computed.targets) {
    approximate(target.low, reference + (low - reference) * target.months / 12, row.symbol + " low interpolation");
    approximate(target.high, reference + (high - reference) * target.months / 12, row.symbol + " high interpolation");
  }
}

// The main server embeds this pure module by stripping export prefixes. Verify
// that this does not depend on module resolution or third-party packages.
const moduleSource = await fs.readFile(new URL("../lib/valuation-targets.mjs", import.meta.url), "utf8");
assert.equal(/^\s*import\s/m.test(moduleSource), false);
const context = vm.createContext({ Date, URL, fixture, NOW });
vm.runInContext(moduleSource.replace(/^export\s+/gm, ""), context);
assert.equal(vm.runInContext("calculateValuationTargets(fixture, { now: NOW }).targets[2].mid", context), 140);
assert.equal(vm.runInContext("chooseValuationTarget(calculateValuationTargets(fixture, { now: NOW }), 12, 'mid').price", context), 140);
console.log("Valuation seed/embedding guards passed: all 12 exact assumption sets and ISIN keys, no active targets, dependency-free embedding.");

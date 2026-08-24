# ASH Stock Parameter Source of Truth

Status date: 2026-07-30  
Schema: 2.1  
Operating mode: paper trading only  
Live trading: disabled  
EDGE_CONFIRMED: NO

This directory is the permanent repository source for the audited ASH Stock parameters. Do not reconstruct operational values from chats or scattered Drive workbooks.

## Canonical files

- `config/ash-stock-parameters.v2.2.json` — executable parameter values, paper-capital policy, Kelly linkage, and unresolved gates.
- `config/paper-trader-capital.v0.5.json` — human-readable capital mirror with cost-inclusive affordability arithmetic; the v2.2 registry remains authoritative.
- `config/validation-evidence.v2.1.json` — dated dataset and chronological holdout evidence.
- `lib/parameter-registry.mjs` — registry loader and invariants.
- `lib/risk-governor.mjs` — fail-closed paper exposure governor.
- `scripts/parameter-registry-guard.mjs` — CI/runtime safety assertions.

## Current clean state

- Paper capital: INR 1,000,000.
- Maximum position: 2.5%.
- Maximum open positions: 20.
- Maximum portfolio heat: 25%.
- Exposure ladder: 100 / 70 / 50 / 25%.
- Damage threshold: 0.213; fire rule: 5 sessions in 10.
- FII cash stress: rolling 5-session value at or below Q10.
- FII sell cluster: at least 7 selling sessions in 10.
- Volume experiment: at least 1.5x the 20-session average.
- RSI experiment: RSI(14) between 45 and 70.

## Why edge is not confirmed

The consolidated IFR/FII dataset contains 3,315 rows from 2007-01-08 through 2022-12-08. Fixed chronological testing produced a sign reversal:

| Window | Rows | Damage 15d mean delta | Strict stack 15d mean delta |
|---|---:|---:|---:|
| 2007–2014 train | 1,666 | -0.035347 | -0.042072 |
| 2015–2018 validation | 856 | -0.004226 | -0.002399 |
| 2019–2022 holdout | 793 | +0.011288 | +0.034025 |

The signals may be useful as reactive risk controls, but this evidence does not establish a durable positive entry edge.

## Promotion gates

`EDGE_CONFIRMED` must remain false until all of these exist:

1. Post-2022 holdout data.
2. Costed execution tests across at least 200 stocks.
3. Runtime-integrated FII derivatives and market-wide volume/delivery feeds.
4. Stable results across chronological regimes.
5. Explicit review and versioned registry update.

Missing required risk inputs fail closed to 25% exposure.

## Additional audited evidence

- `docs/evidence/AM07_GROK_WORKBOOK_AUDIT_2026-07-30.md` — extracted F&O/OI and India VIX parameters, recalculation checks, provenance findings, and acceptance decisions.

## User-approved paper parameter promotion — v2.2

On 2026-07-30 the user approved all parameters extracted from the two GROK AM07 workbooks for use in the paper engine. The active executable registry is now `config/ash-stock-parameters.v2.2.json`. This approval activates the rules but does not change `EDGE_CONFIRMED`, which remains false pending the statistical promotion gates above.

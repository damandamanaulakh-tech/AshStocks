# IFR and FII cash-stack audit

Date: 24 September 2026. Read-only historical audit. No raw file or V01 edits, extraction, imports, Mongo calls, provider requests, dependency installs, strategy activation or deployment.

## Scope and result

Both `IFR_FII_Cash_Stack_Test_v0_6_CSV.zip` and `ifr_fii_cash_stack_test_v0_6.zip` match their pinned release sizes and SHA-256 values. All 15 file members were fully decoded and every CSV row/cell parsed. They contain nine distinct CSV contents, with six identical copies across the two archives. Coverage is 13,384 member-instance data rows, or 6,708 rows after deduplicating identical file contents. The 2,140,153 uncompressed bytes contain CSVs only, with no executable generator, Excel formula cells or formula-like CSV cells. Schemas and all textual parameter recommendations were read. There are no width errors in the selected CSVs.

The daily joined table and selected equity curves each contain 3,315 unique ascending dates from 2007-01-08 through 2022-12-08. All 11 performance rows and all 16 block numeric metric sets reproduce under the identified arithmetic. This demonstrates internal arithmetic consistency, not investable performance or production readiness.

Machine-readable evidence: `data/asset-review/ifr-cash-research-evidence-2026-09-24.json`. Local exploratory reproducibility helper: `/private/tmp/ash-ifr-cash-audit.py --compact` (not an application dependency; not committed), using the bundled Python/pandas/numpy runtime. The helper reads archives in memory and emits JSON only. The evidence records all member hashes, row counts, schemas, missingness, exact duplicate relationships and individual checks. It is an exploratory audit, not an importer.

## Material findings

1. **The joined backtest drops available return dates.** Every joined `ew_ret`, `tail_down3_5d` and `disp_5d` exactly matches `UNIQUE_TRIGGER_MINER_v0_3_CSV_PACK/05_daily_market_internals.csv` by date. That source has 3,926 observations over the same date span, so the joined test omits 611 available daily returns. All source returns compound to 16.233815×; the retained joined returns compound to the published 6.629926× baseline. These are comparisons of supplied derived series, not validated tradable benchmarks. Neither source universe survivorship nor corporate-action adjustment is established here.

2. **The displayed CAGR annualizes the shortened row count.** The supplied baseline CAGR, 15.464779%, equals `6.629926^(252/3315) - 1`, using approximately 13.15 observation-years rather than the approximately 15.92 calendar years in the date range. Calendar annualization of that same incomplete wealth path is 12.620670%. The adaptive row similarly reports 18.556453% versus 15.107442% on a calendar-span basis. Changing the exponent alone does not repair omitted returns or execution assumptions.

3. **The thresholds reproduce retrospective full-history calibration.** All 3,770 upstream cash Q10 and Q05 flags equal the full-sample 5-row-sum quantiles, respectively -4,559.829 and -7,226.144 crore. All joined cash values and exported cash flags match that upstream file exactly. The damage count and damage signal exactly reproduce the full 7,162-row IFR source's 90th-percentile tail threshold, 0.2129870129870129, applied as a rolling 10-source-row count of at least five. That IFR source spans 1996-01-02–2024-07-05, including observations beyond the tested cash overlap. The descriptive rounded 0.213 threshold happens to produce the same joined flags. These are future-informed calibrations unless an independently fixed, point-in-time specification is supplied. The blocks reuse these signals and are not walk-forward validation.

4. **“15d” and “30d” are retained-row horizons, with truncated tails.** Every exported forward return exactly equals the product of the next 15 or 30 retained joined-row returns. Full 15-row windows span 21–103 calendar days, and full 30-row windows span 43–133 days. The final 15 and 30 observations still contain forward values computed from fewer remaining rows; the last row is zero for both horizons. All 14 forward-distribution rows reproduce these values, so those statistics include incomplete-horizon observations. Missing outcomes must be explicitly unavailable in a corrected, separately approved analysis.

5. **Three different observation sequences are mixed.** IFR damage is calculated on the upstream IFR sequence, cash sums on the upstream 3,770 cash-date sequence, and portfolio/forward returns on the 3,315-row inner join. Upstream cash uses rolling-five sums with `min_periods=3` and rolling-ten sums with `min_periods=5`. The cash sums therefore differ from rolling sums over the joined table on 1,151 and 2,061 rows respectively. This is verified lineage, not automatically a calculation error; the source/date availability policy needs to be explicit before use. The unresolved day-first cash-date convention and previously identified source arithmetic issues remain inherited limitations.

6. **Event lead labels are not verified exchange-session counts.** All nine covered event rows' fire counts match their stated 15-row windows; two 2024 events are correctly labelled outside the cash overlap. Eight covered windows also match the last 15 joined observations strictly before the event. The 2016-11-09 event is absent from the joined series, and its published window ends on 2016-11-07 even though 2016-11-08 is present before the event. Its one-day lead labels therefore do not count every available pre-event observation. An exchange calendar and explicit missing-event-date policy are still required.

7. **The clusters are not demonstrably independent.** The full 12-by-12 correlation table is finite, symmetric and unit-diagonal. The directly available nine signals reproduce 81 cells; upstream cash Q05 and IFR TD95 extend this to 121 cells, all matching. `STRUCT_FRACTURE` lacks its exact daily signal definition in the selected archives, so its remaining 23 cells have not been independently reproduced. `FII_ANY` and `FII_DII_DIV` are placed in different clusters despite correlation 0.921962. With no clustering algorithm or threshold supplied, these labels do not establish independent evidence or justify counting both as separate confirmations.

8. **Execution, repair and decision authority remain incomplete.** No fills, publication timestamps, transaction costs, slippage, funding or cash-interest terms appear in the matching return arithmetic. A lag of one retained row does not prove executable next-open pricing. `REPAIR_AFTER_DAMAGE_CANDIDATE` is fully read and used as an exported input, but its generation formula is not established. A differently named v0.4 repair-ratio definition does not reproduce it; that is a version/definition gap, not proof that the v0.6 flag is erroneous. The separately reviewed nested v0.6 workbook itself labels state-machine repair HOLD and live trading NO. The six selected CSV parameter recommendations remain source opinions, not approval to activate their formulas.

## Independently reproduced equations

These are descriptions of the supplied test, not adopted application rules.

- `DAMAGE_CLUSTER_5IN10 = DAMAGE_CLUSTER_COUNT_10D >= 5`; the count matches the last ten upstream IFR observations with tail-down fraction above the source full-history p90.
- `FII_ANY_CONFIRM = Q10 OR SELL_CLUSTER OR DII_DIVERGENCE`.
- `IFR_FII_STRICT_CONFIRM = DAMAGE_CLUSTER_5IN10 AND FII_ANY_CONFIRM`.
- `SELL_CLUSTER = count(last ten upstream cash observations with FII net < 0) >= 7`.
- `DII_DIVERGENCE = FII_5row_net < 0 AND DII_5row_net > 0`.
- Binary overlays use exposure `1 - 0.5 * previous_joined_row_signal`, with initial exposure 1. Baseline exposure is 1.
- The adaptive exposure is independently recovered as `clip(1 - 0.30*DAMAGE - 0.20*Q10 - 0.20*SELL_CLUSTER - 0.10*DII_DIVERGENCE, 0.25, 1)`, lagged one joined row. All 3,315 resulting exposures and curve points match. This equation is inferred from the supplied outputs and checked against them; no generator definition was supplied.
- The two-state status matches: if NORMAL and strict-enter, enter DEFENSIVE; otherwise, if DEFENSIVE and repair, exit NORMAL. Its previous joined-row status controls 50% exposure. There are 46 simultaneous enter/repair rows, so previous-state precedence matters. An enter-priority rule that ignores previous state would disagree on 34 rows.
- Equity compounds `equity[t] = equity[t-1] * (1 + exposure[t] * ew_ret[t])`. Sharpe is `mean(return)/sample_std(return)*sqrt(252)` with zero risk-free return. Maximum drawdown includes initial capital 1 as a possible peak. Each block resets first exposure to 1.
- `signal_days` counts same-row signals or defensive statuses, not necessarily the number of later reduced-exposure rows. Terminal signals have no following return observation. This explains several one-row differences without calling them arithmetic failures.

## Reuse and next authority boundary

These nine distinct files are historical research references and possible regression fixtures. They are not a new stock universe, new cash observations to import over existing history, current institutional evidence, or approved buy/risk inputs. Preserve the original recommendations and formulas with their hashes and dates, but keep this backtest logically outside eligible trading evidence.

The useful next steps are: resolve cash date semantics and historical instrument identities; rebuild a complete, calendar-aligned return path with explicit no-data states; then agree predeclared point-in-time thresholds, full forward-window rules, executable fills and costs before out-of-sample retesting. Any persistence, correction pipeline or strategy activation remains a separate approved phase. Nothing in this audit changes Mongo or trading gates.

This checkpoint upgrades precisely these 15 previously inventory-only CSV members to full semantic read with partial independent calculation validation. It does not claim the remaining release archives, binary workbooks or source prices have been fully validated. The numeric comparisons above are local evidence only; no online exchange/source authority verification was performed.

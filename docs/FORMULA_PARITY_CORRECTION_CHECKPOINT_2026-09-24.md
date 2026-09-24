# Source-formula parity correction checkpoint

Date: 24 September 2026. Branch: `codex/valuation-targets-market-refresh`.
Parent: `4c20ac716c13f38022f6fa09c55e4b421a8f235c` (research/report asset audit).

## Authority and completion boundary

The user explicitly approved an **offline formula correction** after the source audit identified five misassigned trigger IDs and incomplete-window/availability problems. The approval permits correction against unambiguous saved definitions and allows resulting advisory/generic-scanner scores to change. It does not permit invented thresholds, changed ranking weights, additional strategy activation, deployment, Mongo writes or trades.

This batch changes only the feature-branch formula implementation, its availability catalog and offline tests. All 175 existing ID/name/formula triples, the 64 existing T12W IDs, historical source wording and raw asset files are preserved. Main and local `V01-2026-09-07` remain at `226e1394d5af3f0c380593d58917b8d2ee5c13e8`; the approximately 3 GB V01 backup is untouched. Feature publication is not Render deployment or live-data verification. The overall nine-phase goal remains open.

Source lineage and prior defects are recorded in `docs/RESEARCH_FORMULA_LINEAGE_AUDIT_2026-09-24.md` and the preserved rows in `data/asset-review/research-formula-source-rows-2026-09-24.json`. Archived research performance is not a validated live edge or permission to change risk policy.

## Corrected executable contracts

| ID | Correct behavior and evidence minimum |
| --- | --- |
| `T12W_0004` | ATR14 empirical percentile over **252 complete ATR samples <= 20**, AND latest close strictly above the trailing 20-observation low. Requires **266 valid HLC observations**, excluding the seeded first ATR sample. The old partial 126-sample availability and omitted price-low condition are removed. |
| `T12W_0018` | Strict up-close volume / total volume over the latest seven observations **>= 0.62**. Requires eight valid closes, including the first comparison's predecessor, seven finite nonnegative volumes and a positive total. Flat closes are not up volume. |
| `T12W_0080` | Latest close / SMA20 **> 1.12 AND CLV < 0.4**, under the correct ID. Requires 20 valid closes and a finite positive latest HLC range. Heavy down-volume is not substituted for this rule. |
| `T12W_0084` | Rising ATR14 and close strictly below SMA10, under the correct ID. Requires **17 valid HLC observations** for three fully anchored ATR values. Strong-open/weak-close counts are not substituted for this rule. |

Conventions are explicit, not silently revised: ATR14 remains the existing arithmetic mean of true ranges, not Wilder smoothing; percentile retains empirical `<=` ranking. For `0084`, the existing interpretation is **three ATR observations/two strict increases**. The phrase “rising 3 days” does not uniquely specify three increments; adopting that different convention would require a separate contract decision. Source lead-window labels such as 1W/1–2W are preserved but are not treated as indicator warmup lengths.

## Honest unavailable rules

Twelve IDs now carry `implementation_status: SOURCE_REQUIRED`, `status: DEFINED` and a specific unresolved reason. They contribute neither a fabricated HIT nor a fabricated CLEAR:

- `0009`, `0012`: the saved bandwidth definition/cutoff or percentile reference window is incomplete. Volume dry-up or a fixed width threshold alone is not the saved composite rule.
- `0079`, `0081`, `0085`: weak-CLV/timing, distribution-cluster constituents/count/threshold, and strong-gain/flag construction are unresolved. Wrong-ID substitutes were removed.
- `0073`, `0078`, `0082`, `0086`, `0088`: previous catalog claims said executable, but no executable branch existed and construction/timing/proximity contracts remain unresolved.
- `0083`, `0087`: numeric saved definitions exist, but their own execution branches were absent. They remain `IMPLEMENTATION_REQUIRED`; this correction does not activate additional rules.

These are suffixes of `T12W_`. Prior catalog claims are retained as `previous_catalog_status` and `previous_catalog_readiness`, not relabelled as source-workbook facts. The catalog version is `ashstocks-parameter-tunnel-v1.1-175-formula-parity`; the original generation timestamp remains, with a separate implementation-review date.

## Connected runtime path and preserved policy

The original normalizer could coerce or discard malformed candles before the formula validator saw them. The scanner also retained only 260 observations, too few for the corrected ATR window. Both integration issues were reproduced and corrected:

```text
raw provider/row candles -> existing normalization + process-local raw-input lineage
  -> unchanged primary scanner calculations -> bounded 266-observation evidence
  -> strict formula-window validation -> 175-node results and availability
  -> generic scanner blend / existing Upstox advisory overlay
```

The lineage uses a WeakMap, not a JSON property supplied by a client. Repeated normalization and the scanner's bounded evidence slice preserve original missingness; forged JSON metadata cannot bypass it. Finite decimal strings and provider-array candles remain supported. Null/blank/Boolean/percentage/nonfinite inputs, duplicate dates, invalid dates, invalid HLC ranges and insufficient history fail closed for the corrected formulas. Malformed history outside the retained evidence window need not invalidate valid recent evidence.

This is process-local evidence, **not persisted provenance**: already-serialized legacy data whose original invalid values were lost cannot be reconstructed. Unique dated observations do not independently prove a complete exchange-session calendar. The correction does not claim historical corporate-action validation, current quote freshness, or a comprehensive audit of every other formula.

Generic blending remains 70/30, with existing weights and hard gates unchanged. The Upstox overlay still restores the primary scanner score and keeps tunnel output advisory. An independent comparison over ten synthetic 310-candle panels found no state/value change for the 159 non-target IDs between the prior 260-observation path and the new 266-observation path; this is bounded regression evidence, not a universal equivalence proof. Historical lift/risk constants and unreviewed strategies are unchanged.

## Verification

Final successful checks, run sequentially where they share a disposable application copy:

- **85 package-check commands passed**, including the new **14 grouped formula-parity tests**, existing 23 institutional backend scenarios, 16 UI groups, Mongo-memory, paper-flow, execution, valuation and official-market guards.
- **57 named assembled smoke checks passed**, now also containing eight formula-path cases: complete/incomplete ATR history, five malformed-close variants and a null record. These exercise the actual assembled normalizer/scanner path, not just a helper substitute.
- The other three package-smoke commands passed: universe rotation, valuation integration and official-NSE unit/runtime checks. The 2,361-symbol rotation count is a fixture, not fresh market membership.
- **43 historical asset/identity Python tests passed**. `git diff --check` passed.
- Independent review found no remaining blocking issue within the approved scope. It checked the embedded production helpers/normalizer and the generic/Upstox score boundaries; assembled smoke provides the separate end-to-end offline layer.

Legacy smoke assertions requiring an arbitrary minimum of 80 evaluated nodes were replaced with exact availability assertions for corrected/held IDs and equality between stored paper evidence and the actual entry-scan count. Falsely executable nodes must not be restored to satisfy a count. No production threshold was lowered.

Intermediate attempts are not counted as passes: an early disposable copy omitted configuration, workflow and documentation files required by existing guards; older smoke expectations overcounted executable rules; and the local allowlisted check runner rejected the unsupported name `smoke` before running it. The final copy included the required tracked inputs, and all four smoke commands were then invoked directly and passed. No runner permission was broadened to work around that refusal.

Disposable environment: `/private/tmp/ashstocks-formula-final-6UBNWj`, populated from source/test/configuration files and seven tracked root-data JSON fixtures, with the existing dependency directory linked. Credentials, ignored/live state and Git metadata were excluded. Tests used a cleared environment, mocked external providers and an owned loopback listener. Test paper records and file state remained inside that copy; no production provider, Mongo or broker call occurred.

The **203-file** copied-source manifest matched before and after the successful checks: SHA-256 `046c3435096c1e374c8e30004baacfbaf31cb63fd50bf116e56f31bdb8f3d9ce`. This includes documentation as it stood before this checkpoint was added and the active-goal document was updated. The independently matched **168-file code/test/configuration manifest**, excluding root Markdown and `docs/`, is SHA-256 `0f3eb900ed3834b7325aa7c265a8a8447c958e58b58bb538466ae903c1ebfbe5`. Definition: sorted root `.js/.mjs/.json/.html/.css`, recursive `lib/scripts/vendor/config/tests/.github/workflows`, `render.yaml`, and the seven copied tracked root-data JSON fixtures; each line is `<SHA256>  <relative path>\n`. Runtime outputs and asset-review reports are excluded.

Local Node is v24.19.0. Existing CI targets Node 20 and runs on main pushes/PRs, not ordinary feature pushes. This batch adds the guard to package `guard`/`check` and the local allowlist; the CI workflow itself is unchanged. These are local offline results, not a claim of remote CI, intended-runtime or production success.

## Publication and next phase

This is a separate feature-branch publication after the audit commit `4c20ac7`. The final immutable commit is reported after remote blob/tree/ref verification; it is not a main merge or deployment. Recovery can use the parent commit without altering the untouched V01 baseline.

Continue the remaining asset-review queue, starting with the 42 small participant CSVs and context-checked duplicates. Keep unresolved definitions and historical performance constants for explicit discussion, not automatic adoption. Obtain scoped Atlas alarm/collection metrics and agree the release target before production work. Exact Mongo backup/collection/filter/count/impact must be confirmed before cleanup. The missing dashboard screenshot, fresh universe/read-back, real feed coverage, sourced EPS/P/E targets, sequential paper-flow proof and remote V01 recovery publication remain on the active nine-phase list.

# Upstox and runtime recovery release

## Changes

- Strict known-expiry credential selection. Unknown expiry remains unknown; credential presence is not provider acceptance.
- Bounded Upstox candle, quote and OAuth response headers and bodies; sanitized provider failure codes.
- Credential-specific quote caching, duplicate-request coalescing and non-overlapping SSE polling with disconnect cleanup.
- Malformed OAuth and manual credentials rejected before saving. Callback, token and scanner boundaries preserve provider, storage and application failure distinctions.
- Runtime read/write separation: readiness, dashboard, Orders and history reads do not initialize portfolios, archive records, create indexes or update position marks.
- Bounded independent dashboard loading, explicit unavailable data and unknown mutation outcomes. No automatic retries of uncertain mutations.
- Missing market-context values remain unknown; partial and failed feeds can retry. Valid-input calculations and trading thresholds are preserved.
- Exact-commit health/readiness/health release verification. Stored-state read readiness does not assert write readiness or trading readiness.

This hotfix does not include new valuation or universe features, strategy activation, stock imports, database deletion or live broker-write capability. Existing core trading, selection and ledger implementations are preserved.

## Verification

The isolated release tree passed 72 package-check commands, 57 broad smoke groups, Python compilation and the compatibility API smoke. Focused checks cover credential selection, bounded HTTP and cache behavior, OAuth/candle consumers, route error classification, native localhost SSE disconnects, generated-runtime storage behavior, UI states and exact-release verification. External provider and storage calls in these checks use synthetic fixtures.

## Deployment and rollback

Verify CI for the exact release commit before deployment. Confirm its full Git SHA across health, non-mutating readiness and health again. Successful readiness proves stored-state readability only; report provider authentication separately using a bounded read-only check.

Do not invoke engine-run, imports, OAuth callback or token-save endpoints merely to test connectivity. Preserve existing background-operation settings. Roll back to the previous verified release if the new code cannot start, introduces a health regression, exposes private diagnostics or changes state through an intended read-only route.

## Remaining limitations

Per-request time limits do not establish a whole-scan deadline or a separate deadline for every credential-store lookup. Existing archive-before-save behavior is retained; additional archive batching and acknowledgement improvements are separate work. Strategy/accounting/session defects, independent held-position monitoring, static-file security and Python compatibility hardening are outside this hotfix. Local tests do not prove deployment success, live provider acceptance or database write readiness.

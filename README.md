# AshStocks

AshStocks is the merged private stock-engine project replacing separate AM07/G07 wording.

Core rule: no fake success, no hidden formula, no placeholder marked as real.

## Product identity

AshStocks = private AI-powered market brain + auto paper-trading engine + transparent control dashboard.

AM07 is treated as the existing running paper-trading brain/reference.
G07 is treated as the transparent lab/control/dashboard concept.
Both are merged under AshStocks.

## Current source-of-truth stack

- GitHub repo: damandamanaulakh-tech/AshStocks
- Reference repo inspected: damandamanaulakh-tech/sourceborn-engine branch claude/control-panel-ui-1
- Data archive: Google Drive + future indexed raw file storage
- Engine target: Python/FastAPI backend
- UI target: private dashboard built inside this repo, Lovable optional/not required
- Server target: AWS preferred by owner
- Database target: MongoDB Atlas existing/free for now, Supabase/Postgres optional for structured tables and file storage
- Monitoring target: Sentry or AWS logs

## Non-negotiable build rules

1. Paper-first engine, but full feature design is allowed.
2. No real/live broker order path without explicit owner approval and environment unlock.
3. Every scan must record selected, rejected, watchlist, gate reasons, parameter hits, parameter blocks, config snapshot, data source, and timestamp.
4. Every imported file must be indexed with source, hash/ID, row count, columns, date range, and adoption status.
5. Every unproven claim must stay in ProofLedger/GapTable.
6. No placeholder function may return fake OK or fake rows_upserted.
7. Missing data must be marked ACCESS_REQUIRED, SOURCE_FOUND, INGESTION_PENDING, DATA_NEEDED, or ERROR with reason.

## First brain direction

AshStocks will not blindly copy AM07. It will absorb useful parts from AM07/sourceborn-engine, then replace weak points with stronger AshStocks layers.

Adopt from inspected repo:
- auto paper scan/refresh flow
- Nifty 200 momentum formula
- risk_v2 drawdown/correlation/liquidity/consecutive-loss gates
- IFR DAMAGE_CLUSTER + TAIL_DAMAGE_RATIO overlay
- quality blend low-vol/liquidity co-score
- proof-gap ledger idea
- Upstox OAuth and PAPER_ONLY safety pattern

Improve beyond inspected repo:
- real Upstox historical candle fetch
- NSE equity bhavcopy ingestion
- NSE FO bhavcopy ingestion
- FII/DII and PWOI ingestion
- full parameter ledger
- full data-bank index
- stronger result-proof and yearwise walk-forward
- transparent AshStocks dashboard

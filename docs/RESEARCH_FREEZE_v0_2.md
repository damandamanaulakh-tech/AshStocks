# AshStocks Research Freeze v0.2

Status: source-freeze and research-pass checkpoint.

Purpose: stop drifting across chats/apps and convert all known Drive/GitHub/chat material into one buildable AshStocks brain.

## Core directive

AshStocks is the final app name. AM07 is not the final product; AM07 is an existing paper-trading reference engine. G07 is not the final product; G07 is the transparency/control-lab idea. Sourceborn/ARD/URR/Chityy are historical/internal source lines and parameter banks. Everything is merged under AshStocks.

## User intent preserved

The system is not just a screener, not only a trading bot, and not only an Excel workbook. It is a market-memory and opportunity-discovery engine: 10-15 years of history, top/lower/random industry comparison, 30,000 stock slots, 1,000-1,500+ parameters expanding further, gold/currency/commodity/index layer, weekly high/low history, FII/DII/PWOI/derivatives flow, and a private auto paper-trading brain.

## Non-negotiable rules

1. No fake OK.
2. No placeholder marked real.
3. No rows_upserted: 0 success.
4. If data is absent or inaccessible, write DATA_NEEDED / ACCESS_REQUIRED / INGESTION_PENDING.
5. Same filename is only a duplicate candidate; do not drop unless size/hash/schema confirms duplicate.
6. Preserve every meaningful word from chat/docs as raw material, but convert it into ledgers and build tasks instead of long chat replies.
7. AshStocks must explain selected, rejected, blocked, failed, and removed decisions.
8. Every scan/trade/report must include source data, config snapshot, parameter hit/block counts, and reason ledger.

## Highest-value raw sources already located

- Stocks Data Drive folder: `1tPCRLtpEmId3Gxajrk8U0C2s7efSknut`.
- Full App subfolder.
- FII subfolder.
- NSE/BSE/MCX/MTF/MIS instrument JSON files.
- `nse_all_stock_data (1).csv` ~82.8 MB.
- `PWOI_data.csv`.
- `Fii Dii Trading activity.csv`.
- `fii_entity_daily.csv`.
- `fii_symbol_daily.csv`.
- `fii_daily_aggregate.csv`.
- `master_30000_stock_list.csv`.
- `ARD_Chityy_Sourceborn_Stock_Parameter_Master_Upstox_Ready_v1.xlsx`.
- `ARD_Opportunity_Stock_Parameter_Master_v0_6.xlsx`.
- `ARD_Opportunity_Stock_Asset_Master_v0_8.xlsx`.
- `Chityy_Sourceborn_FINAL_MICRO_SPLIT_ENGINE_v0_6.xlsx`.
- `Stock Industry Asset Database.docx`.
- `AM07-main.zip` and `G07-main.zip`.
- Existing GitHub branch `damandamanaulakh-tech/sourceborn-engine@claude/control-panel-ui-1`.

## Immediate research/build order

1. Finish file inventory.
2. Create duplicate-candidate ledger.
3. Expand and read priority files by category.
4. Build Drive-to-AshStocks ingestion code for CSV/XLSX/ZIP/GZ.
5. Import current instrument master files.
6. Import FII/DII/PWOI files.
7. Import large equity OHLCV file if schema is usable.
8. Wire Upstox historical candle fetch to fill missing candle gaps.
9. Build proof runner for yearly walk-forward and regime splits.
10. Only after real ingestion: dashboard.

## Current build stance

Dashboard is deliberately delayed until the raw material and brain are frozen. Visual polish without data and proof caused earlier failures. AshStocks now prioritizes data, ledgers, proof, and paper-engine behavior first.
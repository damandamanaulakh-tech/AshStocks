# AshStocks — Next Build Order v0.1

## Current lock

AshStocks is the final app. AM07 and G07 are absorbed as internal source/reference layers, not public identity.

## Build order

1. **Data Bank first**
   - Fill `SOURCE_FILE_INDEX.csv` with every Drive/GitHub/uploaded file.
   - Add row counts, sheet names, date ranges, column names, adoption decision.

2. **Real ingestion**
   - Test `ashstocks/data/upstox_candles.py` with one instrument key.
   - Run `ashstocks/data/nse_fo_bhavcopy.py` on the real NSE FO file.
   - Add FII/DII parser.
   - Add PWOI parser.
   - Add NSE equity bhavcopy parser.

3. **Brain proof**
   - Run selection brain on known OHLCV.
   - Record selected/watch/rejected/DATA_NEEDED.
   - Track parameter hit/block counts.
   - Run yearly walk-forward after 15Y data lands.

4. **Auto paper engine**
   - 09:20 scan.
   - 14:30 refresh/top-up.
   - 15:35 EOD report.
   - Paper-only execution ledger.

5. **Dashboard**
   - Private login.
   - Dashboard overview.
   - Parameter Lab.
   - Scanner table.
   - Risk dashboard.
   - Gate reasons.
   - Proof ledger.
   - Reports/export.

6. **AWS deployment**
   - AWS server for FastAPI backend.
   - AWS Secrets Manager for Upstox secrets.
   - MongoDB Atlas or Supabase/Postgres for records.
   - S3/Supabase Storage for raw files.
   - Sentry + CloudWatch for errors/logs.

## Rule

No hidden success. No fake OK. No real-world claim without proof row.

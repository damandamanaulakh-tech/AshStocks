# AshStocks Drive File Ledger v1

Status: 2026-07-13

This is the step-down ledger the project needed before more building. It maps every file from the Drive handoff manifest into scope, content meaning, why it matters, parameter family, AshStocks link, and what has or has not been done from it.

Inspection status meanings:

- `CONTENT_READ`: text/content was read directly in this thread.
- `CONTENT_PARTIAL`: content or workbook preview/manifest was read, but not every sheet/file inside was fully extracted.
- `MANIFEST_ONLY`: classified from filename, manifest, size, and folder context only. This must not be treated as proof.

## Core Control Files

| File | Scope | What It Says / Contains | Why Required | Parameters / Signals | AshStocks Link | What I Made | Status |
|---|---|---|---|---|---|---|---|
| PROJECT_FILE_MANIFEST_ALL_AVAILABLE.csv | master ledger | 165-file manifest with names, sizes, modified times | base truth list; stops guessing | file ledger, source priority, duplicate map | `docs/ashstocks-drive-file-ledger-v1.md` | this ledger | CONTENT_READ |
| PROJECT_FILE_LIST_THIS_PART.txt Part 1 | part inventory | 88 files in handoff part 1 | confirms available files | source grouping | file ledger | merged into ledger | CONTENT_READ |
| PROJECT_FILE_LIST_THIS_PART.txt Part 2 | part inventory | 77 files in handoff part 2 | confirms available files | source grouping | file ledger | merged into ledger | CONTENT_READ |
| NEW_CHAT_CONTINUATION_PROMPT.txt | project control | reverse engine, Sourceborn/URR loop, IFR truth, no fake data | defines outcome and operating rules | KEEP/WATCH/ARCHIVE/DATA_NEEDED, Halt Point, ProofLedger | `/api/framework`, framework doc | framework patch, doc | CONTENT_READ |
| README_PART.txt Part 1 | package info | says part 1 contains 88 files | handoff validation | none | file ledger | read as package context | CONTENT_READ |
| README_PART.txt Part 2 | package info | says part 2 contains 77 files | handoff validation | none | file ledger | read as package context | CONTENT_READ |
| README_UPLOAD_TO_DRIVE.txt | upload note | upload/process instruction file | handoff trace | source control | file ledger | not used yet | MANIFEST_ONLY |
| 01_Project_Master_Summary_What_You_Want.docx | requirement summary | likely target/outcome summary | should define final product expectation | product scope, success definition | product spec | not extracted yet | MANIFEST_ONLY |
| 02_System_Architecture_Sourceborn_URR_Chityy_IFR.docx | architecture | likely system design for Sourceborn/URR/Chityy/IFR | needed before code architecture | loops, modules, proof layers | framework architecture | not extracted yet | MANIFEST_ONLY |
| 03_Data_File_Status_And_Validation_Report.docx | data status | likely validation status of uploaded files | needed to separate usable vs gap | readiness, gaps | data-bank roadmap | not extracted yet | MANIFEST_ONLY |
| 04_New_Chat_Continuation_Prompt_And_Next_Loop.docx | continuation | likely doc version of prompt/next loop | keeps project continuation | next loop control | framework loop | not extracted yet | MANIFEST_ONLY |

## File Ledger Table

| File | Scope | What File Has / Says | Why Required | Parameters It Gives | Where It Links | What I Made From It | Status |
|---|---|---|---|---|---|---|---|
| 02-02-2016-TO-01-02-2021-RELIANCE-ALL-N.csv | single-stock history | RELIANCE historical OHLC/volume sample | test stock-level reverse pattern and candle parser | price path, volume, drawdown, rise/fall events | OHLCV candle bank | not wired yet | MANIFEST_ONLY |
| 02-02-2016-TO-01-02-2021-SBIN-ALL-N.csv | single-stock history | SBIN historical OHLC/volume sample | bank stock event/pattern test | price path, volume, drawdown, rise/fall events | OHLCV candle bank | not wired yet | MANIFEST_ONLY |
| 05_daily_market_internals.csv | market internals | daily market-wide internals | regime/breadth validation | breadth, advances/declines, regime pressure | regime layer | listed as required feed | MANIFEST_ONLY |
| 06_EARLY_WARNING.md | parameter thesis | 30 India early-warning parameters | big framework parameter bank | DBI, HHI, up/down volume, FII futures, PCR, basis, GST, SIP, demat | `/api/framework` | framework layer added | CONTENT_READ |
| 07_DATA_FORMATS.md | feed schema | required CSV schemas and priority feeds | tells exact columns to ingest | bhavcopy, FII derivatives, FO, GST, AMFI, demat, index/VIX, FX | feed ledger | required feed map added | CONTENT_READ |
| 9-06-2021-TO-9-06-2026-RELIANCE-ALL-N (1).csv | single-stock history | RELIANCE 5Y recent history | recent out-of-sample stock test | OHLCV, return, volatility | OHLCV candle bank | not wired yet | MANIFEST_ONLY |
| 9-06-2021-TO-9-06-2026-SBIN-ALL-N (1).csv | single-stock history | SBIN 5Y recent history | recent bank test | OHLCV, return, volatility | OHLCV candle bank | not wired yet | MANIFEST_ONLY |
| _archive_inner.xlsx | archive workbook | extracted/inner archive workbook | may contain prior compiled data | unknown until opened | source ledger | not used yet | MANIFEST_ONLY |
| am07.xlsx | parameter workbook | likely AM07 strategy/parameter sheet | possible parameter source | strategy/risk parameters | parameter bank | not used yet | MANIFEST_ONLY |
| anthropic_2026_05_31_215474526086069.txt | AI notes/code | model-generated notes | may contain requirements or code ideas | unknown until read | idea archive | not used yet | MANIFEST_ONLY |
| Apr_2023.zip | historical data zip | April 2023 data package | bhavcopy/event-window feed | daily OHLC/FO/volume possible | feed ingestion | not unpacked | MANIFEST_ONLY |
| archive (1).zip | archive zip | prior archive package | duplicate/source check | unknown until unpacked | file ledger | not unpacked | MANIFEST_ONLY |
| archive.zip | archive zip | prior archive package | duplicate/source check | unknown until unpacked | file ledger | not unpacked | MANIFEST_ONLY |
| ARD_Chityy_Sourceborn_Stock_Parameter_Master_Upstox_Ready_v1.xlsx | Upstox-ready parameter master | compiled stock parameter workbook | direct bridge to Upstox implementation | parameter list, Upstox fields, blocks | scanner/parameter bank | not fully extracted | MANIFEST_ONLY |
| ARD_Google_Live_Stock_Fill_v1.xlsx | live-fill workbook | Google/live fill scaffold | source mapping and stock fill queue | live/current fields, queue fields | data-bank loader | not fully extracted | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_7.xlsx | asset master | asset/industry/parameter master | early asset universe design | industry, asset class, parameter dictionary | framework/data model | not fully extracted | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_8.xlsx | asset master | updated asset/industry/parameter master | newer master than v0.7 | industry, asset, stock slots, parameter dictionary | framework/data model | not fully extracted | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_8_COPILOT_FILLED-1.xlsx | filled asset master | copilot-filled variant | compare filled vs proof | filled parameters, stock slots | duplicate review | not trusted as proof | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_8_COPILOT_FILLED.xlsx | filled asset master | copilot-filled variant | compare filled vs proof | filled parameters, stock slots | duplicate review | not trusted as proof | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_8_COPILOT_FILLED_v2_DISTINCT100.xlsx | filled asset master | distinct-100 variant | separate visible sample from proof | distinct map, filled params | duplicate review | not trusted as proof | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Asset_Master_v0_8_FILLED.xlsx | filled asset master | filled asset universe | compare with original | stock slots, industry, parameters | data model | not trusted as proof | MANIFEST_ONLY |
| ARD_Opportunity_Stock_Parameter_Master_v0_6.xlsx | parameter master | opportunity stock parameter master | main 1200-ish parameter source | industry, growth, collapse, timing, risk blocks | parameter bank | not fully extracted | MANIFEST_ONLY |
| ARD_Parameter_Master_Compiled_Upstox_Ready_v1.xlsx | compiled parameter master | Upstox-ready parameter list | map abstract params to Upstox fields | master parameter list, fill-ready fields | API/scanner settings | not fully extracted | MANIFEST_ONLY |
| BhavCopy_NSE_FO_0_0_0_20260603_F_0000.csv.zip | FO bhavcopy | NSE futures/options bhavcopy sample | derivatives validation | futures, options, OI, value, expiry | PWOI/FO layer | not unpacked | MANIFEST_ONLY |
| Chityy_all_copilot_filled.xlsx | Chityy filled workbook | filled parameter/stock workbook | compare filled ideas vs proof | parameter bank, scoring engine, risk governor | parameter bank | not trusted as proof | MANIFEST_ONLY |
| Chityy_all_copilot_filled_v2_DISTINCT100.xlsx | Chityy filled workbook | distinct-100 filled version | current visible sample separation | distinct stock map, parameters | parameter bank | not trusted as proof | MANIFEST_ONLY |
| Chityy_all_filled (1).xlsx | Chityy filled workbook | duplicate filled workbook | duplicate review | parameters/scoring/risk | duplicate ledger | not used yet | MANIFEST_ONLY |
| Chityy_all_filled.xlsx | Chityy filled workbook | filled workbook original | compare with fixed/copy variants | parameters/scoring/risk | parameter bank | not used yet | MANIFEST_ONLY |
| Chityy_all_filled_REVIEW_FIXED_v0_3 (1).xlsx | review fixed workbook | fixed review duplicate | compare fixed changes | parameters/scoring/risk | duplicate ledger | not used yet | MANIFEST_ONLY |
| Chityy_all_filled_REVIEW_FIXED_v0_3.xlsx | review fixed workbook | fixed review workbook | likely more reliable parameter source | parameters/scoring/risk | parameter bank | not used yet | MANIFEST_ONLY |
| Chityy_REVERSE_PATTERN_PARAMETER_ENGINE_v0_4.xlsx | base engine | reverse pattern master control | core engine logic source | adopted params, reverse rise/fall, scoring, risk | Sourceborn/Chityy engine | identified as master control | CONTENT_PARTIAL |
| Chityy_Sourceborn_FINAL_MICRO_SPLIT_ENGINE_v0_5.xlsx | prior final | v0.5 lineage | preserve lineage and avoid restart | micro split, file pileup, data gaps | framework lineage | used as context only | CONTENT_PARTIAL |
| Chityy_Sourceborn_FINAL_MICRO_SPLIT_ENGINE_v0_6.xlsx | current final | v0.6 micro split, 27 source files, 22,891 parameter rows, 30k stock slots, halt for 15Y data | latest control workbook | micro split, Upstox schema, reverse event schema, gap ledger | `/api/framework`, doc | framework layer added | CONTENT_PARTIAL |
| Chityy_Sourceborn_IFR_Expansion_Check_v0_4.xlsx | IFR expansion | expansion/validation workbook | IFR candidate validation | IFR expansion params | IFR layer | not fully extracted | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_Expansion_Check_v0_4_CSV.zip | IFR CSV pack | CSV export of expansion check | easier import than XLSX | IFR expansion rows | IFR data ingest | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_FII_Cash_Stack_Fwd15_Hist_v0_6.png | chart | forward 15D histogram image | visual proof of distribution | fwd15 distribution | proof report | not used in code | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_FII_Cash_Stack_Test_v0_6.xlsx | IFR+FII test | adaptive IFR+FII paper stack improved CAGR/DD but not live edge | central paper-throttle evidence | IFR damage, FII cash, strict confirm, state machine, event matrix | framework IFR/FII layer | added paper-ready statuses | CONTENT_PARTIAL |
| Chityy_Sourceborn_IFR_FII_Cash_Stack_Test_v0_6_CSV.zip | IFR+FII CSV pack | CSV export of test workbook | importable proof tables | strategy performance, robustness, event fire, correlations | proof ledger | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_Fwd15_Histogram_v0_5.png | chart | IFR forward 15D histogram | visual validation | fwd return distribution | proof report | not used in code | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_Validation_Hard_Checks_v0_5.xlsx | IFR validation | hard-check workbook | validates IFR damage/repair rules | DAMAGE_CLUSTER_5IN10, strict/adaptive decisions | IFR layer | not fully extracted | MANIFEST_ONLY |
| Chityy_Sourceborn_IFR_Validation_Hard_Checks_v0_5_CSV.zip | IFR validation CSV | CSV export of hard checks | importable IFR proof | IFR hard-check rows | IFR data ingest | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_MICRO_SPLIT_CSV_PACK_v0_5.zip | micro split CSV | v0.5 CSV exports | source pileup/detail import | parameter pileup, duplicate groups, stock splits | ledger import | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_MICRO_SPLIT_CSV_PACK_v0_6.zip | micro split CSV | v0.6 CSV exports | latest importable split pack | 22,891 params, duplicate groups, 30k stock slots | ledger import | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_PRE_RISE_FALL_TRIGGER_LAYER_CSV_CODE_v0_2.zip | trigger code/data | pre-rise/fall trigger code CSV | reverse pattern mining | pre-rise/fall triggers | trigger engine | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_PRE_RISE_FALL_TRIGGER_LAYER_v0_2.xlsx | trigger workbook | pre-rise/fall trigger layer | identify before-event features | lead triggers | trigger engine | not extracted | MANIFEST_ONLY |
| Chityy_Sourceborn_PYRAMID_PAPER_ENGINE_CODE_v0_1.zip | paper engine code | pyramid paper engine code package | paper execution logic source | sequence/paper maps | paper engine | not merged | MANIFEST_ONLY |
| Chityy_Sourceborn_PYRAMID_RUNNING_MAPS_v0_1.zip | running maps | pyramid running maps | sequence/state running logic | route maps, state maps | paper/sequence engine | not unpacked | MANIFEST_ONLY |
| Chityy_Sourceborn_PYRAMID_SEQUENCE_PAPER_TEST_v0_1.xlsx | paper test | sequence paper test workbook | validates route before code | paper sequence params | paper engine | not extracted | MANIFEST_ONLY |
| Chityy_Sourceborn_UNIQUE_TRIGGER_MINER_v0_3.xlsx | trigger miner | unique trigger miner workbook | find non-duplicate triggers | unique triggers, combos | trigger engine | not extracted | MANIFEST_ONLY |
| Chityy_Sourceborn_UNIQUE_TRIGGER_MINER_v0_3_CSV_PACK.zip | trigger CSV | CSV pack for trigger miner | importable trigger results | trigger combos | trigger engine | not unpacked | MANIFEST_ONLY |
| Chityy_Stock_Master_Parameter_Workbook_v0_1.xlsx | stock master | early stock parameter workbook | baseline parameter design | Upstox import, signal engine, risk, pattern library | parameter bank | not extracted | MANIFEST_ONLY |
| Chityy_Stock_Master_Parameter_Workbook_v0_1_COPILOT_FILLED.xlsx | filled stock master | copilot-filled early workbook | compare filled vs proof | parameter/risk/signal rows | duplicate review | not trusted as proof | MANIFEST_ONLY |
| Chityy_Stock_Master_Parameter_Workbook_v0_1_COPILOT_FILLED_v2_DISTINCT100.xlsx | filled stock master | distinct-100 early workbook | visible stock sample | stock params, distinct set | duplicate review | not trusted as proof | MANIFEST_ONLY |
| Chityy_Stock_Master_Parameter_Workbook_v0_2_1200.xlsx | stock parameter bank | 1200-parameter workbook | broad parameter dictionary | 1200 params, groups, scoring/risk | parameter bank | not extracted | MANIFEST_ONLY |
| Claude 200 N data.csv | N200 current sample | 198 rows current N200 fields | sample/current values, not proof | sector, industry, price, market change | sample universe | not used as proof | MANIFEST_ONLY |
| deepseek_text_20260530_031414.txt | AI notes | generated notes | requirement/idea source | unknown | idea archive | not read | MANIFEST_ONLY |
| DS ARD -1.docx | document | ARD notes | requirement/source thinking | unknown | product spec | not read | MANIFEST_ONLY |
| event_validation.csv | event validation | small event validation table | event proof | event labels/outcomes | proof ledger | not ingested | MANIFEST_ONLY |
| Feb_2022.zip | historical data zip | Feb 2022 data | 2022 correction window | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| Fii Dii Trading activity.csv | flow data | FII/DII activity table | flow pressure feed | FII/DII cash | FII/DII layer | not ingested | MANIFEST_ONLY |
| fii-dii-combined-latest.csv | latest flow | tiny latest combined file | current snapshot | FII/DII latest | FII/DII layer | not ingested | MANIFEST_ONLY |
| fii-dii-nse-latest.csv | latest flow | tiny NSE latest file | current snapshot | FII/DII latest | FII/DII layer | not ingested | MANIFEST_ONLY |
| FII.zip | flow archive | FII data archive | historical flow feed | FII cash/derivatives | FII/DII layer | not unpacked | MANIFEST_ONLY |
| fii_dii.xlsx | flow workbook | FII/DII workbook | flow data source | cash flow, activity | FII/DII layer | not extracted | MANIFEST_ONLY |
| fo03062026.zip | FO archive | 2026-06-03 FO data | derivatives sample | futures/options/OI | derivatives layer | not unpacked | MANIFEST_ONLY |
| Gemini 31 may ARD.docx | AI notes | Gemini ARD doc | idea/source comparison | unknown | idea archive | not read | MANIFEST_ONLY |
| Gemini ful Omini 50.docx | AI notes | Gemini notes | idea/source comparison | unknown | idea archive | not read | MANIFEST_ONLY |
| gemini-code-1780146321905.txt | code notes | generated code text | possible scripts | unknown | code archive | not read | MANIFEST_ONLY |
| gemini-code-1780192213342.txt | code notes | generated code text | possible scripts | unknown | code archive | not read | MANIFEST_ONLY |
| gemini-code-1780192253210.txt | code notes | generated code text | possible scripts | unknown | code archive | not read | MANIFEST_ONLY |
| gemini-code-1780193071322.txt | code notes | generated code text | possible scripts | unknown | code archive | not read | MANIFEST_ONLY |
| gemini-code-1780429992436.txt | code notes | generated code text | possible scripts | unknown | code archive | not read | MANIFEST_ONLY |
| Grok 4+.docx | AI notes | Grok notes | idea/source comparison | unknown | idea archive | not read | MANIFEST_ONLY |
| image.png | image | screenshot/visual asset | context maybe | unknown | archive | not inspected | MANIFEST_ONLY |
| India 10-Year Bond Yield Historical Data.csv | macro data | India 10Y yield history | cross-asset regime warning | yield change, safe-haven, liquidity stress | regime layer | required feed listed | MANIFEST_ONLY |
| Jan_2022.zip | historical data zip | Jan 2022 data | 2022 correction lead window | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| Jul_2023.zip | historical data zip | July 2023 data | event/regime validation | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| Jun_2023.zip | historical data zip | June 2023 large data pack | validation feed | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| Mar_2023.zip | historical data zip | March 2023 data | validation feed | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| master_30000_stock_list.csv | broad universe | 30,000 stock list placeholder/source | universe/slot design | symbol, company, industry, market cap | stock universe design | not used live; Upstox master used instead | MANIFEST_ONLY |
| n200_live_report (1).csv | current N200 sample | duplicate current sample | sample only | current price/sector | sample universe | not proof | MANIFEST_ONLY |
| n200_live_report.csv | current N200 sample | current N200 sample | sample only | current price/sector | sample universe | not proof | MANIFEST_ONLY |
| New folder (2).zip | archive zip | unknown package | source recovery | unknown | archive | not unpacked | MANIFEST_ONLY |
| New folder.zip | archive zip | unknown package | source recovery | unknown | archive | not unpacked | MANIFEST_ONLY |
| Nov_2023.zip | historical data zip | November 2023 data | validation feed | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| nse_all_stock_data (1).csv.zip | stock data archive | all-stock CSV zipped | major historical data candidate | OHLCV/all-stock fields | candle bank | not unpacked | MANIFEST_ONLY |
| Oct_2023.zip | historical data zip | October 2023 data | validation feed | bhavcopy/FO possible | validation feed | not unpacked | MANIFEST_ONLY |
| parameters_v0_7.csv | parameter dictionary | 1200 rows parameter dictionary | broad parameter inventory | blocks, parameter names, source priority | parameter bank | identified, not ingested | MANIFEST_ONLY |
| Pasted text.txt | pasted requirement | user/source pasted text | requirement context | unknown until read | product spec | not read | MANIFEST_ONLY |
| process_latest_fii_batch.py | script | FII batch processing script | can wire FII ingestion | FII parsing rules | feed ingestion | not merged | MANIFEST_ONLY |
| Purity test Grouping.docx | validation doc | purity/grouping notes | duplicate/signal purity | grouping/purity concepts | proof ledger | not read | MANIFEST_ONLY |
| PWOI_data.csv.zip | PWOI archive | participant OI data zipped | derivatives/PWOI layer | OI, participant positions | PWOI layer | not unpacked | MANIFEST_ONLY |
| Reports-Daily-Multiple.zip | daily reports | daily reports archive | data source for market internals | report fields unknown | feed ingestion | not unpacked | MANIFEST_ONLY |
| Reports-Monthly-Multiple.zip | monthly reports | monthly reports archive | macro/flow/monthly feed | report fields unknown | regime layer | not unpacked | MANIFEST_ONLY |
| Requirment.docx | requirement doc | requirement notes | product target | unknown | product spec | not read | MANIFEST_ONLY |
| review_new_data.py | script | new data review script | validate uploaded feeds | readiness checks | feed validation | not merged | MANIFEST_ONLY |
| SB & URR.docx | Sourceborn/URR doc | SB/URR explanation | control-loop clarity | Sourceborn/URR rules | framework control | not read | MANIFEST_ONLY |
| SB + URR.docx | Sourceborn/URR doc | SB/URR explanation | control-loop clarity | Sourceborn/URR rules | framework control | not read | MANIFEST_ONLY |
| SB- URR run.docx | Sourceborn/URR run doc | run workflow | operational loop | run stages | framework control | not read | MANIFEST_ONLY |
| Site control.txt | site control | deployment/site notes | deploy/runtime control | unknown | deployment | not read | MANIFEST_ONLY |
| Sourceborn Sequence Review - done.docx | sequence review | completed sequence review | Sourceborn stage validation | sequence rules | framework control | not read | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2.xlsx | flow review workbook | FII derivatives/cash review | flow evidence | cash/derivative readiness | FII/PWOI layer | not extracted | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/event_coverage_new_data.csv | coverage | event coverage table | proof event coverage | event coverage | proof ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/fii_dii_cash_flow_2012_2023.csv | FII/DII history | cash flow 2012-2023 | core flow feed | FII cash, DII cash, divergence | FII/DII layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/file_inventory_new_batch.csv | inventory | file inventory for batch | source verification | feed list | file ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/pwoi_fii_derivatives_features_2012_2023.csv | PWOI/FII features | derived participant/derivative features | core derivative confirmation | PWOI/FII feature columns | PWOI layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/pwoi_participant_oi_long_2012_2023.csv | PWOI long | participant OI long format | historical PWOI base | participant, instrument, OI, date | PWOI layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/pwoi_participant_oi_wide_2012_2023.csv | PWOI wide | participant OI wide format | easier feature generation | wide OI features | PWOI layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/readiness_summary.csv | readiness | readiness summary | gate feed availability | readiness status | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2/signal_readiness_map_after_new_batch.csv | readiness map | signal readiness after new batch | tells which signal can run | signal readiness | proof ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_derivatives_cash_review_v0_2_csv_pack.zip | CSV pack | zipped v0.2 CSV outputs | importable flow pack | FII/PWOI CSVs | feed ingestion | not unpacked | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3.xlsx | flow review workbook | v0.3 flow/volume/derivatives review | latest flow review | flow, volume, derivatives params | framework layer | not extracted | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/cash_event_window_signal_summary.csv | event summary | cash event-window signal summary | evidence for flow signals | event windows, hit/fail | proof ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fii_derivatives_stats_current_clean.csv | clean derivatives | current clean FII derivative stats | current derivative snapshot | FII derivative values | PWOI/derivatives layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fii_dii_cash_full_history_clean.csv | clean cash history | full clean FII/DII history | main flow feed | FII/DII cash, divergence | FII/DII layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fii_dii_cash_latest_snapshot_2026_06_08.csv | latest snapshot | 2026-06-08 FII/DII cash snapshot | current flow check | latest FII/DII cash | FII/DII layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fo_futures_bhavcopy_2026_06_03_sample.csv | FO futures | futures bhavcopy sample | derivatives parser sample | futures price, OI, value | derivatives layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fo_options_pcr_oi_by_symbol_2026_06_03.csv | PCR/OI | options PCR/OI by symbol | option pressure signal | PCR, call/put OI | derivatives layer | required feed listed | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fo_report_pack_summary_2026_06_03.csv | FO summary | report pack summary | confirms FO pack coverage | file/report status | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/fpi_monthly_net_investments_parsed.csv | FPI monthly | parsed monthly FPI investments | macro/flow regime | monthly FPI flow | regime/flow layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/new_fii_volume_derivatives_parameters_v0_3.csv | parameter list | new flow/derivative parameter decisions | direct parameter source | FII volume derivatives parameters | `/api/framework` concept | referenced in framework | CONTENT_PARTIAL |
| sourceborn_fii_volume_derivatives_review_v0_3/participantwise_oi_latest_clean.csv | latest PWOI | latest participant OI clean | current PWOI snapshot | participant OI | PWOI layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/participantwise_volume_latest_clean.csv | latest participant volume | participant volume snapshot | derivatives participation | participant volume | PWOI layer | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/readiness_status.csv | readiness | v0.3 readiness status | tells usable vs gap | readiness flags | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/README_SUMMARY.txt | summary | v0.3 review summary | explains package | parameter/readiness summary | framework doc | not read | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3/source_file_inventory.csv | inventory | source files in v0.3 | provenance | source inventory | file ledger | not ingested | MANIFEST_ONLY |
| sourceborn_fii_volume_derivatives_review_v0_3_csv_pack.zip | CSV pack | zipped v0.3 CSV outputs | importable flow package | FII/derivative CSVs | feed ingestion | not unpacked | MANIFEST_ONLY |
| sourceborn_fpi_cash_batch_check_v0_1.zip | FPI batch | FPI cash check package | flow validation | FPI cash checks | flow layer | not unpacked | MANIFEST_ONLY |
| sourceborn_ifr_fii_cash_stack_test_v0_6/block_robustness.csv | robustness | time-block robustness | validates if signal survives periods | PASS/FAIL by time block | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/daily_joined_ifr_fii_cash_signals.csv | joined signal data | daily IFR + FII joined rows | core paper stack input | IFR flags, FII flags, exposure | IFR/FII layer | not ingested | MANIFEST_ONLY |
| sourceborn_ifr_fii_cash_stack_test_v0_6/equity_curves_selected.csv | equity curves | strategy equity curves | proof of paper stack performance | baseline/adaptive/strict/state equity | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/event_fire_matrix.csv | event matrix | signal fires before named events | lead-time validation | fire flags, lead days, status | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/parameter_decisions.csv | parameter decisions | keep/watch/hold decisions | direct adoption decision source | KEEP_FOR_PAPER, HOLD, WATCH | framework | referenced | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/signal_correlation_matrix.csv | correlation matrix | fire-day correlations | pruning duplicate signals | signal correlation | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/signal_forward_return_distribution.csv | forward returns | fwd15 distribution by signal | false-positive/risk validation | mean/median/p05/p95/negative pct | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/signal_independence_clusters.csv | clusters | correlation-pruned signal clusters | avoid duplicate confirmations | independent signal clusters | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_ifr_fii_cash_stack_test_v0_6/strategy_performance.csv | performance | paper strategy performance table | validates paper-only exposure stack | CAGR, DD, Sharpe, exposure | proof ledger | summarized from workbook | CONTENT_PARTIAL |
| sourceborn_today_picks.csv | sample picks | today picks sample | sample only, not proof | rank, ticker, score, reasoning | scanner sample | not used as proof | MANIFEST_ONLY |
| sourceborn_validation_data.zip.zip | validation data | sourceborn validation package | possible combined validation feed | unknown until unpacked | validation ingest | not unpacked | MANIFEST_ONLY |
| sourceborn_validation_readiness_check_v0_1.xlsx | readiness workbook | validation readiness check | tells what can be tested | readiness | feed ledger | not extracted | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1.zip | volume/delivery pack | volume delivery batch package | market-wide delivery layer | delivery, volume triggers | volume-delivery layer | not unpacked | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/industry_coverage_summary.csv | coverage | industry coverage | coverage check for 16-stock batch | industry coverage | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/mini_delivery_trigger_counts_16stocks.csv | delivery triggers | trigger counts for 16 stocks | early delivery signal test | delivery trigger count | volume-delivery layer | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/mini_market_internals_16stocks.csv | internals | mini market internals for 16 stocks | breadth/volume pilot | internals, volume, breadth | volume-delivery layer | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/nse_volume_delivery_16stocks_eq_merged.csv | delivery data | merged EQ volume/delivery for 16 stocks | volume-delivery proof base | delivery qty, delivery pct, volume | volume-delivery layer | required feed listed | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/readiness_status.csv | readiness | volume-delivery readiness | tells feed usability | readiness flags | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/source_file_summary.csv | source summary | source files summary | provenance for volume batch | file coverage | file ledger | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/symbol_coverage_summary.csv | coverage | symbol coverage | validates stock coverage | coverage counts | feed ledger | not ingested | MANIFEST_ONLY |
| sourceborn_volume_delivery_batch_check_v0_1/symbol_industry_map.csv | map | symbol-industry map | sector/industry grouping | symbol, industry | sector mapping | not ingested | MANIFEST_ONLY |
| table (1).csv | table | small table | unknown until read | unknown | archive | not read | MANIFEST_ONLY |
| Tool initiation rule.docx | process doc | tool initiation rules | workflow control | process rules | operating process | not read | MANIFEST_ONLY |
| top_combo_triggers.csv | trigger output | top combo triggers | trigger candidate list | combo triggers | trigger engine | not ingested | MANIFEST_ONLY |
| top_pre_fall_triggers.csv | trigger output | top pre-fall triggers | fall early-warning candidates | pre-fall triggers | trigger engine | not ingested | MANIFEST_ONLY |
| URR Core.txt | URR rules | URR core text | reality-check control | URR checks | framework control | referenced, not fully read | MANIFEST_ONLY |
| URR Source samples DS RAW THOUGHTS.docx | URR/source notes | raw thoughts | possible control guidance | unknown | framework control | not read | MANIFEST_ONLY |
| URR-07_Final_Clean_Core(1).docx | URR doc | clean URR core duplicate | control rules | URR stages | framework control | not read | MANIFEST_ONLY |
| URR-07_Final_Clean_Core.docx | URR doc | clean URR core | control rules | URR stages | framework control | not read | MANIFEST_ONLY |
| urr07.txt | URR text | URR text version | easier extraction of URR rules | URR rules | framework control | not read | MANIFEST_ONLY |

## What This Ledger Says About The Gap

The actual source material is much deeper than the current app. The current app has only active NSE master + Upstox historical OHLCV + technical/liquidity gates. The Drive handoff is asking for a reverse-pattern proof engine with IFR/FII/PWOI/volume-delivery/event validation and Sourceborn/URR control.

The next correct build is not another UI card. It is:

1. Read/extract the `CONTENT_PARTIAL` and highest-priority `MANIFEST_ONLY` files.
2. Import CSV packs into Mongo collections with a source ledger.
3. Wire FII/DII cash, PWOI, IFR, and volume-delivery as paper exposure/state layers.
4. Only after proof, allow those layers to affect SELECT.

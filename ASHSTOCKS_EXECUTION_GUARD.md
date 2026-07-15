# AshStocks Execution Guard

This file is the working contract for every AshStocks change. It exists because the product goal is not a generic dashboard and not another disconnected page.

## Confirmed Product Rule

AshStocks is a broker-grade Indian market product with real data, real scanner logic, real workflow, and paper execution only.

Paper execution means only money movement and broker order placement are simulated. Everything before that must behave like a real trading app: universe, candles, filters, parameter hits, watchlists, signals, order ticket, target/stop, position, P&L, journal, reports, and audit trail.

## Non-Negotiables

- Build for India/NSE, not USA stocks.
- Use Upstox workflow/data first because this product has Upstox keys and historical candle access.
- Do not copy Upstox/Zerodha branding pixel-for-pixel; use broker-grade workflow segments under AshStocks/Sourceborn identity.
- Merge product flows into one app. Do not keep adding disconnected pages that do not talk to scanner, parameters, paper orders, or reports.
- No fake placeholders. If data is missing, show the real missing feed, reason, and next action.
- Keep the Parameter Piano. It is the parameter audit surface and must stay clickable.
- Candle logic must be treated as a parameter family, not as decoration.
- Live orders stay locked. Paper orders must still have real order lifecycle fields: entry, side, quantity, risk, stop, targets, status, reason, timestamp, and audit.

## A vs X Check

Before every answer or commit, write this mentally and verify it in code:

- A: What the user asked for.
- X: What I actually delivered.
- Gap: What is still missing.

If X is only a visual shell while A asked for engine behavior, say that clearly and do not claim completion.

## Merge Check

A change is a merge only if it connects at least two existing product parts, for example:

- Scanner output feeds Watchlist, Signals, Orders, GTT, Positions, or Reports.
- Parameter Piano click explains a real parameter used by scanner or paper engine.
- Candle hit changes score, decision, signal, or order readiness.
- Missing feed appears in Data Intel and blocks only the affected parameter family.

If the change only creates a new screen with static text, it is not a merge.

## Broker Workflow Skeleton

AshStocks should expose these workflow areas as one product:

- Dashboard and market strip: NIFTY, SENSEX, BANK NIFTY, VIX, USD/INR, key context.
- Markets: indices, sectors, breadth, theme movement, macro/commodity context.
- Scanner: NSE universe, filters, scores, decisions, reasons.
- Parameter Piano: numbered parameter map with click-to-detail and hit state.
- Signals: selected stocks, evidence, candle/volume/price/flow hits, confidence.
- Watchlist: selected, watch-ready, target-room, repair, blocked, data-needed lists.
- Orders: paper buy/sell, intraday/swing/positional mode, quantity, stop, target, risk.
- GTT: paper target/stop plans and trigger ledger.
- Positions: paper holdings, P&L, target progress, sell/replace decision.
- Reports: daily run, missed data, parameter hit summary, paper trade journal.
- Settings: Upstox connection, risk rules, paper capital, scan schedule, data feeds.

## Candle Parameter Family

Candle structure must become a real parameter block. At minimum it should include:

- Breakout candle near 20D/60D/252D high.
- Wide range candle with volume confirmation.
- Gap up / gap down with follow-through.
- Hammer / rejection from support.
- Bullish engulfing / bearish engulfing.
- Inside bar breakout.
- Doji or exhaustion candle after extended move.
- Three-candle momentum continuation.
- Lower-wick demand candle with delivery/volume support.
- Failed breakout / bull trap / bear trap.

Each candle hit must show:

- parameter number,
- stock,
- candle date/timeframe,
- evidence values,
- pass/fail threshold,
- effect on score/decision/order readiness.

## Before Final Response Checklist

- Did I answer the latest user message, not an older message?
- Did I say clearly whether this is Upstox-style, Zerodha-style, or AshStocks-only?
- Did I explain what changed in real product terms?
- Did I mention what is still not merged?
- Did I avoid claiming placeholders as working data?
- Did I verify GitHub/Render/live health when deployment was touched?
- Did I keep the explanation short and direct?

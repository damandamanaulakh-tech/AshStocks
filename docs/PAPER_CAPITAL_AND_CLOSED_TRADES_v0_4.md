# ASH Stock Paper Capital and Trade Lifecycle v0.4

## Active paper parameters

| Parameter | Value |
|---|---:|
| Starting paper capital | ₹50,00,000 |
| Capital deployment target | 100% |
| Minimum new BUY value | ₹1,00,000 |
| Base entry allocation | 2% |
| Maximum single-position allocation | 10% |
| Eligible/lifecycle entry limit | 80 |
| Automatic BUY candidates per run | Up to 80 |
| Simultaneous positions affordable at the minimum | 50 |

₹50 lakh divided by ₹1 lakh equals 50 simultaneously affordable minimum-size
positions. The engine can evaluate and track up to 80 entries, but it cannot
open position 51 until realized proceeds restore at least ₹1 lakh of buying
power.

## Capital gates

- The server fixes the paper account starting capital at ₹50,00,000.
- A new paper BUY below ₹1,00,000 is rejected.
- A BUY larger than current buying power is rejected.
- Active BUY GTT plans reserve buying power until triggered or closed.
- The no-positive-edge Kelly state still blocks new entries.
- Positive Kelly sizing cannot reduce an otherwise permitted paper entry below
  the configured ₹1,00,000 operational minimum.
- Existing orders, positions, trades, and realized P&L are preserved when the
  previous ₹25,00,000 default is migrated.

## Closed-trade lifecycle

Every paper SELL now records:

- stock symbol and quantity;
- entry and exit price;
- invested and exit value;
- realized P&L and realized return percentage;
- entry and exit time;
- holding days; and
- close reason.

The Paper Book exposes separate **Open Positions**, **Closed Trades**, and
**Order History** tabs. The desktop Paper Book owns vertical scrolling, so all
rows remain reachable at 100% browser zoom.

This remains paper-only. Live broker writes stay disabled.

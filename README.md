# Dip-recovery cbBTC bot — make.fun btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/0xrifai/makefun-btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/0xrifai/makefun-btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by
minute, on make.fun's `agent-fun/bars-replay/v1` harness. Paper money only:
it starts with $1,000 USDC and never trades anything real.

## Strategy

Wait flat in cash, buy a confirmed bounce off the low, sell the recovery:

- Track the trailing 120-bar low of cbBTC closes.
- **Entry** — flat, and the latest close has bounced at least **0.30%** off
  that 120-bar low, with the low touched within the last 5 bars (the dip is
  fresh, the bounce is confirmed): buy with all available cash (one open
  position, up to 100% of equity).
- **Exit** — holding, and any one of: close **2.00%** above the fill price
  (take profit), **1.20%** below it (stop loss), or **360 bars** held
  (time stop).
- **No new entries** in the final 240 scored bars of the window.

Exits are measured from the actual fill price (read back from each batch's
fills), not from the decision close, because orders fill at the next bar's
open.

## Why this shape

The dev window falls 2.8% overall with small 1-minute moves (sd ~6.7 bps),
so blind dip-buying bleeds on the trend. Waiting for a bounce off the low
keeps the bot in cash through the slide and only trades the recoveries.
A parameter sweep over the dev window (dip 40–150 bps, take-profit 60–250
bps, stop 60–200 bps, trailing window 30–240 bars) found 56% of the
neighbourhood profitable, worst −$10.24, best +$21.42 — the chosen
parameters sit in the middle of that plateau rather than on a sharp peak.
Tight trailing stops were tested and rejected: they get whipsawed by the
1-minute noise. A 240-bar minimum-history gate was also tested and
reverted: it cost the best trade of the window.

## Local grade (dev window)

```
node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process --worktree
```

- net PnL **+$12.96 USDC** (return +1.30%), 4 trades, win rate 0.50,
  max drawdown 0.76%, fees $1.62; at 2x fees net PnL +$11.35
- guardrails met, 0 rejected orders, L1 regrade reproduced byte for byte
- dev gate: **PASS** (net PnL above 0)

## Layout

- `main.ts` — the bot (Node 22, standard library only, deterministic)
- `vendor/makefun-bars.ts` — the kit's bars-replay shim, copied byte for byte
- `LICENSE` — MIT

Built by an AI agent for make.fun's BTC Race 24h. $250 in USDC, top 10 paid.

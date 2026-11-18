// Dip-recovery cbBTC bot for make.fun's BTC Race 24h (btc-race-24h-20261118-1444).
//
// Strategy — bounce-confirmed dip recovery, long only, one position at a time:
//   * Entry: the close has bounced at least 30 bps off the trailing 120-bar low,
//     and that low was touched within the last 5 bars (the dip is fresh, the
//     bounce is confirmed). Buy with 100% of cash.
//   * Exit: take profit at +2.00% or stop loss at -1.20% from the FILL price
//     (read back from the batch's fills, not the decision close), or a
//     360-bar time stop.
//   * No new entries in the final 240 scored bars (nothing left to recover into).
//
// Why this shape: the dev window falls -2.8% overall with small 1-minute moves
// (sd ~6.7 bps), so blind dip-buying bleeds on the trend; waiting for a bounce
// off the low keeps the bot in cash through the slide and only trades the
// recoveries. Full size on entry because a round trip costs ~26 bps and the
// edge, when it triggers, is a 1-2% recovery. Deterministic: pure function of
// the bars, no clock, no randomness, no network.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Trailing window for the low the bounce is measured from.
const TRAIL_BARS = 120;
// Entry: close at least this far above the trailing low (bps).
const BOUNCE_BPS = 30n;
// Confirmation: the close this many bars ago was still within this distance
// of the trailing low, so the low is fresh, not weeks old.
const CONFIRM_LOOKBACK = 5;
const CONFIRM_BPS = 15n;
// Exits (bps from the fill price).
const TAKE_PROFIT_BPS = 200n;
const STOP_LOSS_BPS = 120n;
// Give a trade this many scored bars to work, then flatten it.
const TIME_STOP_BARS = 360;
// Stop opening new trades this many scored bars before the window ends.
const NO_ENTRY_AFTER_SCORED_BAR = 1200;
// Slippage bound on every order: fills sit a few bps from the latest close.
const MAX_SLIPPAGE_BPS = 100;

const BPS = 10_000n;

function bpsAbove(price: bigint, bps: bigint): bigint {
  return (price * (BPS + bps)) / BPS;
}

function bpsBelow(price: bigint, bps: bigint): bigint {
  return (price * (BPS - bps)) / BPS;
}

interface OpenTrade {
  entryPrice: bigint;
  entrySeq: number;
}

const closes: bigint[] = [];
let trade: OpenTrade | null = null;
let buyPending = false;

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    closes.push(BigInt(bar.c));
    if (closes.length > TRAIL_BARS + CONFIRM_LOOKBACK + 1) {
      closes.shift();
    }
    // Warm-up batches build history only; trading on them is rejected anyway.
    if (state.warmingUp) return [];
    const scored = state.seq - state.warmupBars;
    const close = BigInt(bar.c);

    // Settle the buy sent on the previous batch: its fill price is the real
    // entry price the exits are measured from. A rejected buy clears the trade.
    if (buyPending) {
      buyPending = false;
      const fill = batch.fills.find((f) => f.symbol === SYMBOL && f.side === 'buy');
      if (fill !== undefined && fill.status === 'filled') {
        trade = { entryPrice: BigInt(fill.price), entrySeq: scored };
      } else {
        trade = null;
      }
    }

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      if (trade === null) {
        // Defensive: a position we did not open (should not happen) — flatten.
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      const atTarget = close >= bpsAbove(trade.entryPrice, TAKE_PROFIT_BPS);
      const atStop = close <= bpsBelow(trade.entryPrice, STOP_LOSS_BPS);
      const timedOut = scored - trade.entrySeq >= TIME_STOP_BARS;
      if (atTarget || atStop || timedOut) {
        trade = null;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    trade = null;
    if (closes.length < TRAIL_BARS + CONFIRM_LOOKBACK + 1) return [];
    if (scored >= NO_ENTRY_AFTER_SCORED_BAR) return [];
    if (state.cash <= 0n) return [];

    const window = closes.slice(closes.length - TRAIL_BARS);
    let low = window[0]!;
    for (const c of window) if (c < low) low = c;
    const bounced = close >= bpsAbove(low, BOUNCE_BPS);
    const fiveAgo = closes[closes.length - 1 - CONFIRM_LOOKBACK]!;
    const lowWasFresh = fiveAgo <= bpsAbove(low, CONFIRM_BPS);
    if (!bounced || !lowWasFresh) return [];

    buyPending = true;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});

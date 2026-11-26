import { xstockTransactableSides } from '../../asset_classes/xstock_spot/transactable-sides.js';
import type { ExitTriggerSelection } from '../../core/trading/exit-trigger.js';
import type { ActiveOpenPosition } from '@shared/schema';
import type { EquityTickerFrame, EquityTickRaw } from '../passive-archive/equity-spot-archiver.js';

export type PaperXstockPriceExit = 'target_hit' | 'stop_hit' | 'break_even_stop' | 'trailing_stop_hit';

export interface PaperXstockExitQuote {
  positionId: string;
  symbol: string;
  trigger: ExitTriggerSelection;
  cause: PaperXstockPriceExit;
  raw: Readonly<EquityTickRaw> | null;
}

export interface PaperXstockExitReplayPolicy {
  maxAgeMs: number;
  refusalLogCap: number;
}

export interface PaperXstockExitFillProof {
  frame: EquityTickerFrame;
  cause: PaperXstockPriceExit;
  trigger: ExitTriggerSelection;
  fillBasis: 'raw_bid';
  receivedAtMs: number;
  ageAtFillMs: number;
  bid: number;
  displayedBidQty: number;
  filledQty: number;
}

type QuoteRefusal = 'position_mismatch' | 'no_frame' | 'replay' | 'retired_connection' | 'age_invalid'
  | 'stale' | 'malformed_book' | 'size_unknown' | 'size_short';
type QuoteGrade = { ok: false; reason: QuoteRefusal } | { ok: true; proof: PaperXstockExitFillProof };

// The closed-trade price and position quantity are numeric(20,8). Refuse magnitudes at
// which a double can no longer resolve a full unit of that precision.
const MAX_PRECISE = 2 ** 26;

export function gradePaperXstockExitQuote(
  quote: PaperXstockExitQuote,
  position: Pick<ActiveOpenPosition, 'id' | 'symbol' | 'mode' | 'assetClass' | 'state' | 'quantity'>,
  maxAgeMs: number,
  nowMonoMs: number,
  isCurrentFrame: (frame: EquityTickerFrame) => boolean,
): QuoteGrade {
  if (position.mode !== 'paper' || position.assetClass !== 'xstock_spot' || position.state !== 'open'
    || position.id !== quote.positionId || position.symbol !== quote.symbol) {
    return { ok: false, reason: 'position_mismatch' };
  }
  const { raw, trigger } = quote;
  if (!raw?.frame) return { ok: false, reason: 'no_frame' };
  if (raw.frame.symbol !== quote.symbol) return { ok: false, reason: 'position_mismatch' };
  if (raw.frame.kind !== 'update') return { ok: false, reason: 'replay' };
  if (!isCurrentFrame(raw.frame)) return { ok: false, reason: 'retired_connection' };
  const ageAtFillMs = nowMonoMs - raw.frame.receivedMonotonicMs;
  if (!Number.isFinite(ageAtFillMs) || ageAtFillMs < 0 || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0
    || !Number.isFinite(raw.atMs) || raw.atMs <= 0) return { ok: false, reason: 'age_invalid' };
  if (ageAtFillMs > maxAgeMs) return { ok: false, reason: 'stale' };
  const sides = xstockTransactableSides(raw);
  if (!raw.frame.numericPrices || !sides || !Number.isFinite(sides.bid) || !Number.isFinite(sides.ask) || sides.bid >= MAX_PRECISE
    || Number(sides.bid.toFixed(8)) <= 0 || trigger.price === null || !Number.isFinite(trigger.price)
    || (trigger.basis === 'bid' ? trigger.price !== sides.bid : trigger.basis !== 'mark')) {
    return { ok: false, reason: 'malformed_book' };
  }
  const quantity = Number(position.quantity);
  const bidQty = raw.bidQty;
  if (!Number.isFinite(quantity) || quantity < 1e-8 || quantity >= MAX_PRECISE
    || !raw.frame.numericBidQty || bidQty === null || !Number.isFinite(bidQty) || bidQty < 0) {
    return { ok: false, reason: 'size_unknown' };
  }
  if (bidQty < quantity) return { ok: false, reason: 'size_short' };
  return {
    ok: true,
    proof: {
      frame: raw.frame, cause: quote.cause, trigger, fillBasis: 'raw_bid', receivedAtMs: raw.atMs,
      ageAtFillMs, bid: sides.bid, displayedBidQty: bidQty, filledQty: quantity,
    },
  };
}

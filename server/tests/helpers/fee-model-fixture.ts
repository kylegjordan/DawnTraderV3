/**
 * B-XSTOCK-FEE-CONTRACT (#1010): the ONE test fixture for `fee_model` rows.
 *
 * The values are the venue schedule the production rows hold after this batch:
 *   crypto_spot  taker 0.008  / maker 0.004    (Kraken spot rung 1, account-confirmed)
 *   xstock_spot  taker 0.0010 / maker -0.0002  (Kraken Pro xStocks — the maker fee is a REBATE)
 *
 * ⛔ Before this batch eight suites carried their own copy of `0.008 / 0.004` for BOTH classes —
 * the defect this batch fixes, reproduced in the tests. Suites that only need the fee cache warm
 * (a PROBE for some other invariant) seed it from here; a suite whose SUBJECT is a fee value
 * asserts against the named constants below, never a bare literal.
 */
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';
import type { ModuleConstant } from '../../../shared/schema.js';

export const CRYPTO_SPOT_TAKER_FEE = 0.008;
export const CRYPTO_SPOT_MAKER_FEE = 0.004;
export const XSTOCK_SPOT_TAKER_FEE = 0.0010;
export const XSTOCK_SPOT_MAKER_FEE = -0.0002;

type FeeKey = 'crypto_spot.spot_taker_fee' | 'crypto_spot.spot_maker_fee' | 'xstock_spot.spot_taker_fee' | 'xstock_spot.spot_maker_fee';

export function feeModelRow(assetClass: string, constantName: string, value: number): ModuleConstant {
  return {
    moduleName: 'fee_model', exchange: '*', assetClass, strategy: '*', regime: '*',
    constantName, value,
  } as unknown as ModuleConstant;
}

/** Seeds the in-memory `fee_model` cache — the same shape server boot's prefetchModule produces. */
export function seedFeeModelForTests(overrides: Partial<Record<FeeKey, number>> = {}): void {
  const v = (k: FeeKey, fallback: number) => (overrides[k] ?? fallback);
  _seedModuleCacheForTests('fee_model', [
    feeModelRow('crypto_spot', 'spot_taker_fee', v('crypto_spot.spot_taker_fee', CRYPTO_SPOT_TAKER_FEE)),
    feeModelRow('crypto_spot', 'spot_maker_fee', v('crypto_spot.spot_maker_fee', CRYPTO_SPOT_MAKER_FEE)),
    feeModelRow('xstock_spot', 'spot_taker_fee', v('xstock_spot.spot_taker_fee', XSTOCK_SPOT_TAKER_FEE)),
    feeModelRow('xstock_spot', 'spot_maker_fee', v('xstock_spot.spot_maker_fee', XSTOCK_SPOT_MAKER_FEE)),
  ]);
}

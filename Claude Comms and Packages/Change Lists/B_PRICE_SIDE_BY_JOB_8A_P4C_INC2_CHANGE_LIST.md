# B-PRICE-SIDE-BY-JOB row `8a-P4c` — CHANGE LIST (increment 2, X0: the zero-defaulted xStock sides deleted; the window extract committed)

**GRADED REF:** stated in the Step-4 dispatch (the commit carrying this file). **Plan:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §C2 (audit + plan) and §C2.3 (Langston's Step-2 ruling and how each condition was built).

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `architecture` — the plan's line 3, the file's ONE graded marker (the mid-document `sub_batch` marker struck, Langston Step-2 C5) |
| **ii** | **THE CLASS'S DOC SET** | **scope** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md` (r2 `e9a6b7f68`) · **pre-audit** — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4C_AUDIT_AND_PLAN.md` §C2 + §C2.3 · **completion report** — batch OPEN; the progress report `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` holds the record, converts at close · **DELETED_COMPONENTS_LOG** — present, this increment's entry (NIT-6) · **BATCH_CATALOG / PHASE_HISTORY / SYSTEM_MANUAL / SIM** — owed at Step 10: SIM's price-map entry loses its sides; System Manual judged (a dead field, no decision) |
| **iii** | **STEP 2** | the plan above, §C2 — Langston PROCEED 2026-09-30T01:31:21Z at `7fc76ca43` with BLOCKER-1 + C2-C5 + NIT-6, all built before this dispatch (§C2.3) |

## WHAT CHANGED — and what did NOT
⛔ **No decision moves.** Every xStock and crypto VTS decision reads what it read before; the only reader of the lookup helper reads `.price`. No epoch change, no migration, no DB write.

| # | file | change | taxonomy |
|---|---|---|---|
| **1** | `server/services/vts-runner.ts` — the real lane's xStock price entry | `bid: parseFloat(r.bid) \|\| 0` / `ask: …` **deleted**, and the entry TYPE no longer carries a side. A missing side was fabricated as zero; nothing read it | **outcome 1 — a latent defect**: a fabricated value, one reader away from firing every stop |
| **2** | `server/services/vts-runner.ts` — the lookup helper's crypto half | returns `{ price }` only; the `bid`/`ask` projection **deleted** with the return type narrowed (C3/C4). The values were faithful but carried no stamp, against the file's own invariant (`:137-139`, `8a-P3` r3 FINDING-2) that crypto touch readers read fresh from the cache | **outcome 3 — legacy**: an affordance contradicting a stated invariant; now compile-enforced |
| 3 | `server/services/vts-runner.ts` — the stale comment | "increment 2 (X0) replaces them" → the deletion and why | — |
| 4 | `server/tests/unit/b-price-side-8a-p4c-x0-fence.test.ts` | **NEW** — 6 tests: a capability arm for every pattern (it matches the forbidden shape, and not the allowed ones), then the fence: no zero-defaulted side anywhere, the entry type side-free, the helper price-only, `rawQuote` still carried on both lanes | — |
| 5 | `scripts/analysis/p4c-window-extract.py` | **NEW, tracked** — the window extract, with the SYM cut on `hour=` and the four controls below | — |

### The code (after)
```ts
  const xstockPriceMap = new Map<string, { symbol: string; price: number; rawQuote: XsQuoteRow }>();
  …
            xstockPriceMap.set(r.symbol, {
              symbol: r.symbol,
              price,
              rawQuote: { last: price, bid: parseQuoteNumber(r.bid), ask: parseQuoteNumber(r.ask), atMs: parseQuoteNumber(r.at_ms) },
            });
  …
  const priceDataMap = {
    get(symbol: string, assetClass?: string): { price: number } | undefined {
      if (assetClass === 'xstock_spot') {
        const x = xstockPriceMap.get(symbol);
        return x ? { price: x.price } : undefined;
      }
      const p = cryptoPriceMap.get(symbol);
      return p ? { price: p.price } : undefined;
    },
  };
```
Before: the entry type was `{ symbol; price; bid: number; ask: number; rawQuote }`, the entry set `bid: parseFloat(r.bid) || 0, ask: parseFloat(r.ask) || 0`, and the helper returned `{ price: number; bid?: number; ask?: number }` — the xStock entry as-is, the crypto `{ price: p.price, bid: p.bid, ask: p.ask }`.
⚠️ **The xStock branch now builds `{ price }` rather than returning the entry**, so `rawQuote` is not reachable through the helper either — its three readers (`recordLook` ×2, `recordPendingLook`) read `xstockPriceMap` directly, unchanged, and the increment-1 P5 fence's `toBe(3)` on `?.rawQuote ?? null` still holds (not re-pointed, per your note).

### The fence is mutation-proved — each mutation run locally against the fence, file restored after each (`cmp` clean)
| mutation | red test |
|---|---|
| M1 re-add `bid: parseFloat(r.bid) \|\| 0,` to the real-lane entry | *no side is defaulted to zero anywhere in the runner* |
| M2 widen the helper to `{ price: number; bid?: number; ask?: number }` | *the lookup helper returns the price only, on BOTH classes* |
| M3 put `bid?: number` back on the entry type | *the real-lane xStock entry type carries no side* |
| M4 restore the crypto projection `{ price: p.price, bid: p.bid, ask: p.ask }` | *the lookup helper returns the price only, on BOTH classes* |
And the type is the first wall: with the entry type side-free, re-adding the `|| 0` assignment is an excess-property error at `tsc`. **tsc: 339 = baseline 339.**

## P6b — THE COMMITTED EXTRACT AND ITS CONTROLS (BLOCKER-1 + C2), run on staging against the closed window
| control | result |
|---|---|
| **(a) negative control** — `--sym-cut stamp` (the old cut) | after-session gap **vts 8,638 · shadow 6,825 — exactly** §9.8's figures ⇒ it reads the corpus the original read |
| the fix — `--sym-cut hour` | after-session gap **0 · 0** (SYM = TOUCH: vts 211,691 · shadow 163,326) |
| **(b) the rotations** | required set enumerated from the range: `error__2026-09-23 … 09-30` + live `error.log` (the final hour's flush); per-file lines printed (e.g. `09-23` 437,482 lines / 3,435 instrument); **a missing rotation is FATAL** — exit 2, nothing printed (shown: a 2026-08-01 start fails on `08-02`) |
| **(c) segment totals** | every session, both lanes, TOUCH and SYM published; all ten segments non-zero (`readable: true`) |
| **(d) per-hour equality over unrestarted hours (C2)** | TOUCH lines placed in an hour by STREAM ORDER (before the lane's flush of hour H ⇒ H), so a straddling pass counts where its looks were recorded. **vts 182 of 182 cells over 177 hours equal · shadow 179 of 179 over 174.** Restarts from PM2's own log: one, the deploy at the window's start (14:38:49Z, before any line; uptime since `2026-09-22T14:38:49.748Z`) ⇒ **0 hours excluded, 0 looks lost** |
| unchanged readings | c* vts 120 s / shadow 60 s · U 1.76% / 1.47% · K 0 · floor symbols 308 / 295 — as §9.6 |

## JUDGEMENT CALLS TO ATTACK
1. **Stream-order attribution for (d)** instead of the TOUCH line's own stamp — it relies on a lane's flush block being written synchronously inside `beginPass`, before that pass's first look (`vts-xs-instrument.ts:169-172`). If a same-lane TOUCH could land inside a flush block, the attribution would be wrong.
2. **The restart rule excludes the restart's hour AND the hour before it** (the flush due at the hour change is lost too). Over-exclusive by design; it excluded nothing here.
3. **Building `{ price }` in the xStock branch** rather than returning the entry: it narrows what the helper exposes to exactly its type, so a future caller cannot reach `rawQuote` through it by a cast.

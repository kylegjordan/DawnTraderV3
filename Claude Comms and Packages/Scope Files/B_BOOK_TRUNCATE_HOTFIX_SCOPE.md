# B-BOOK-TRUNCATE-HOTFIX — SCOPE (#507)

change-class: hotfix

> **Filed retrospectively, and that is a process miss worth naming.** The class was declared in the commit message, which is **not** where the governance checker reads it (`scripts/governance-checker/config.mjs:176-180` — the marker is parsed from this file's header). Alert `7e0dfedb` fired correctly and graded the batch as `architecture`, demanding seven documents it never owed. **Verified against the checker rather than taken on report: `VALID_CLASSES` at `config.mjs:181` is `['architecture','non_architecture','sub_batch','hotfix']`, so `hotfix` IS parseable** — Langston's alert text said it was not, and that half of his note was wrong while his earlier citation was right. Required doc-set for `hotfix` is `changes_and_fixes` alone (`config.mjs:140-143`).
> ⚠️ **THE UNDERLYING RULE DEFECT, homed not buried: a hotfix does not require a scope file, yet a scope file is the only place its class can be declared.** Every hotfix will trip this alert. Not fixed here — see §6.

---

## 1. THE QUALIFYING TEST (hotfix path §1 — all three must hold)

1. **Broken now.** Paper stop-exits were filling against buy offers that no longer existed, recording better exits than the market could give. Kyle saw positive stop-losses on the dashboard and asked how that was possible.
2. **Waiting causes real harm.** Every day adds contaminated rows to the record we calibrate from — Kyle's own framing: *"we think we're learning and doing a lot of good things with our trades, but it's all wrong."*
3. **Blast radius small and PROVEN small.** One writer, one external reader, two engine call sites. Census in §4, independently re-derived by Langston.

**Kyle directed this hotfix, then HALTED it pending an independent investigation, then released it on that investigation's finding.**

---

## 2. THE DEFECT

`handleV2BookUpdate` (`server/exchanges/kraken/kraken-websocket-adapter.ts`) applied every book message as a delta into a persistent map and **never truncated**, and initialised the map **only when absent** — so a `snapshot` merged into stale state instead of replacing it.

Kraken's v2 contract, verbatim: *"After each update, truncate your book to the subscribed depth — you will not receive `qty: 0` for levels that fall out of scope."*

⇒ every level pushed out of the subscribed window was orphaned in the map **forever**. Over hours a dead bid from an earlier, higher price sat **above** the current real ask — a crossed book, which cannot exist at a venue. The paper CLOSE fill walks the bid side (`order-placer.ts`), so a stop-triggered sell filled against the ghost.

**★ OWNERSHIP SETTLED BY MEASUREMENT, not by citing the docs (Langston's probe, which neither of us had run):** of **1,428** levels truncation evicts, only **840** are ever explicitly deleted by the venue. **588 (41%) never receive a delete.** They vanish only if the client discards them. The fault is ours by construction.

**Latent since 8.9.4** — nothing consumed `getBookForFill` until the depth gate went live at the B8.5 switch-on. `#507` (2026-07-15) removed a bogus sequence check and named real validation as unbuilt; **truncation is the half of the contract nobody had read.**

---

## 3. OBJECTIVES

1. **A snapshot REPLACES the book** rather than merging into it.
2. **Truncate to the subscribed depth after every update**, using the depth Kraken **GRANTED** (from the subscribe ACK), never the depth requested.
3. **Compute Kraken's checksum and COUNT match/mismatch — OBSERVE ONLY, never act.**
4. **A readable integrity counter** (`GET /api/active-engine/book-integrity`) so post-deploy proof is a number on demand, not an absence in a rotated log.

⛔ **NOT IN SCOPE:** correcting contaminated `closed_trades` records (separate, Kyle's ruling pending); the `instrument` precision feed (#507 remainder); anything in live mode beyond what objective 1–2 fixes for free.

---

## 4. BLAST-RADIUS CENSUS (§9.5(a); Langston re-derived every list)

| question | answer |
|---|---|
| **writers** of the mini-book | **exactly one** — `handleV2BookUpdate` |
| **readers** | `getBookForFill` — **sole external**, via `depth-source.ts:43` behind an explicit `assetClass === 'crypto_spot'` |
| engine consumers | **exactly two** — open depth gate `active-execution-engine.ts:248`, close fill `:1804` |
| other internal consumers | the `priceTick` mid, and `getLatestPriceData` |
| **deleters** | `softResubscribe` (also clears the raw mirror), `orderBooks.clear()` on disconnect |
| **schedulers** | **none** — message-driven |
| same pattern elsewhere | **none** — `orderBooks` is referenced only at those sites |
| state written / who reads it | the book itself; every reader WANTS a correct book, none depends on the stale one |

**xStock is NOT exposed** — it reads `xstock_spot_ticker_snap`, and its writer stores **each message's own bid/ask as one row**, keeping no running book. The accumulation fault is structurally impossible there.

**VTS is NOT exposed — this claim was made and then REFUTED.** A name collision: `livePricingAdapter.priceCache` (private, `priceTick`-fed, genuinely poisoned) vs the exported `priceCache` singleton (`services/price-cache.ts`, written only from Kraken REST). VTS imports the second. `livePricingAdapter` appears **0 times** in `vts-runner.ts`.

**★ ONLY STOP EXITS ARE EXPOSED.** All 141 crypto taker exits are `stop_hit`/`trailing_stop_hit`; **zero `target_hit`**. Targets rest as maker orders and fill at their own limit, never consulting the book. **Zero maker exits are affected in either asset class.**

---

## 5. MEASUREMENT

| | value |
|---|---|
| crossed book states, **current logic** | **8,452 of 27,190 = 31.08%** (Langston, both arms on one message stream) · 42.14% over 180s |
| crossed book states, **with fix** | **0** |
| max levels held (depth 10) | **228** before, **10** after |
| **damage** | **~$55 net measurable** across the 59 of 141 taker exits with a contemporaneous snapshot; **<$150 bounded**. All in paper mode. |

⛔ **WITHDRAWN, and none of it reproducible: $187.78 · 111 rows · ~$111 crypto overstatement.** All three came from instruments that **cannot distinguish an affected trade from an unaffected one**. The control that proves this — maker exits, which never read the book — sat in the same table one `GROUP BY` away. Every candidate instrument fires at near-equal rates on both arms (42.05% vs 30.38%; 45.63% vs 41.30%; 35.59% vs 32.50%); **only the excursion MAGNITUDE discriminates (382.2 bps vs 58.6 bps).**

**★ THE LESSON, stated as the general form:** *a negative control is not a nicety added when a number looks suspicious — it is what converts a number into a measurement.* Rule 29(b) says this for zeros; it applies exactly as hard to a positive result.

**Confirmatory row:** `ADA/USD` 08-22 05:10:38 `stop_hit` filled **0.258174** while the saved market fell 0.25501 → 0.23501 across that ten-minute window — **above the entire range, higher than the price before the drop began.** A pre-move ghost bid.

---

## 6. HOMED, NOT BURIED (§9.4)

- **`#737` — the `depth: 1` watch item.** `switchToBookChannel` requests depth 1, which Kraken rejects. If it ever acked, truncation to one level would starve the depth gate and **silently suppress opens** for that symbol. Fails CLOSED (no bad fills) but is quiet. Owner CC-C, due with the #507 remainder.
- **`#507` remainder — the `instrument` precision feed.** Kraken sends price/qty as JSON **numbers**; `String()` cannot reconstruct the CRC input, so checksum verification is inert until per-symbol precision is subscribed. Measured live: **0/40 match as written, 40/40 at instrument precision.** Owner CC-B at Phase 20, unchanged.
- **The rule defect above:** a hotfix owes no scope file yet can declare its class nowhere else. Every hotfix trips `class-undeclared`. **Owner CC-A** (B-RULES-1d shipped that path), §13 home required.
- **Contaminated records** — flag all suspect rows, exclude by flag, reconstruct only from retained market data. Kyle's ruling pending; NOT part of this hotfix.

---

## 7. VERIFICATION (pre-registered before deploy)

- **`crossedDetections` must be 0** against the 31.08% comparator. Positive control shipped in the suite: the same handler, truncation disabled, must make the counter FIRE.
- **Stop exits above entry: PASS only at ≥20 new crypto stop-type closes with 0 above entry** (0/20 against a 65% base rate is p≈2×10⁻⁴). Below 20 ⇒ report **INSUFFICIENT** with the actual N, never a clean zero on a small sample.
- **Mismatch high is EXPECTED** and is not the fix failing — see §6, precision feed.

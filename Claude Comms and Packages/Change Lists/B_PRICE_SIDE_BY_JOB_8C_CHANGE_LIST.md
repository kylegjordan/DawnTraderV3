# B-PRICE-SIDE-BY-JOB row `8c` (switch-on) — Step-4 CHANGE LIST (CC-C)

## Dispatch header (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (the batch's class, unchanged) |
| ii | **DOC SET (architecture)** | SCOPE — present, the `3n` batch scope (row `8c` is an item of it) · PRE_AUDIT — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` (§1-§11) · COMPLETION_REPORT — absent, written at Step 11 (the batch is open) · BATCH_CATALOG / PHASE_HISTORY / SYSTEM_MANUAL / SYSTEM_IMPACT_MAP — absent until Step 10, all applicable (the crypto level basis, the cost model's geometry argument, a new boot-started writer, a new module_constants module) |
| iii | **STEP-2 REFERENCE** | `B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` — the 09-28 re-ruling (four conditions), §5-§7 ruled 2026-11-06, §9 amendment 4 RULED 2026-11-07 (Discord `1568738862887473254`), §11 amendment 5 (ruling: see §11) |

## Item map (plan → code)
| item | what shipped | where |
|---|---|---|
| P3 + §9 | **The birth re-base, per stamped form.** `baseCryptoLevelsAtBirth` (pure): entry → the ask; maker → the bid; stop/target re-derived by `rebaseLevels` with `fill` = the bid and `entryBasis` = the ask (item 3). Idempotent on the sided stamp. Stamps `levelGeometry: 'sided'` + `levelBasisAtBirth` (bid, ask, plan, rung, producer, age, stop distance, f). | `server/core/trading/crypto-birth-levels.ts` |
| cond. 1 | **No midpoint fallback, by construction:** no accepted rung, an absent/malformed stamp (item 4), a stamp that does not reproduce the plan (`rebaseLevels` keeps such a leg ON THE PLAN — at birth the plan is the mid, so it is refused here), or an unreadable knob ⇒ the signal is REFUSED, counted pre-SQE as `level_<reason>`. Mutation: reverting the stop to the mid fails 4 tests. | same + `signal-orchestrator.ts` seam |
| seam | In `buildSizedSignalForStrategy`, crypto only, **after the funnel denominator and before the venue grid** (the grid rounds the sided triple; sizing, the target gate, the SQE and the maker/taker decision then judge it). The walk is its own funnel stage, `active_level_build`. | `signal-orchestrator.ts` |
| §5 | `level_basis.level_build_max_age_ms` 60000 · `_max_spread_fraction` 0.50 · `_drift_ref_60s` 0.00429 (crypto_spot), seeded by `2026-11-08-b-price-side-8c-level-build-knobs.sql` (+ rollback, MANIFEST), prefetched, asserted at boot. **`LEVEL_BASIS_OBSERVATION_*` deleted** with the engine's unused import; the active and VTS shadows read the knobs too. | `level-build-config.ts`, `b72-warmup.ts`, `level-basis.ts`, `vts-runner.ts` |
| P4 / §11 | **The spread is counted once at S1-S7**, each reading `levelGeometryOf(metadata)`: S1 birth maker/taker (`'sided'`, maker entry = the recorded bid) · S2 orchestrator net geometry · S3 HF9 pre-filter · S4 RTB refresh geometry + re-decision · S5 the ranker's net R · S6 the open-gate EV · S7 fill economics. `computeNetGeometry` and `evaluateTradeExpectancy` take a REQUIRED `levelGeometry` (throw otherwise). | `cost-model.ts`, `expectancy.ts`, `ready_to_buy_service.ts`, `active-execution-engine.ts`, `fill-economics.ts` |
| S7 detail | At the fill the taker already pays the ENTRY half-spread (walked ask, C-1); mid exits owed the EXIT half. Sided exits carry it, so `composeAskEntrySidedExitFriction = 2·fee + 1·slippage` — test: exactly HALF a spread per unit vs mid. | `fill-economics.ts` |
| maker | **The engine rests a sided maker at the recorded bid** (`makerEntryOf`); at `signal.entryPrice` (now the ask) every maker would be marketable at placement and convert. | `active-execution-engine.ts` |
| hop (v) | **The orchestrator's allow-listed RTB metadata now carries `levelSpec`/`levelGeometry`/`levelBasisAtBirth`** — it dropped them (the `gridAtBirth`/`#550` pattern, documented twice in that block). | `signal-orchestrator.ts` |
| (iv) | A `crypto_spot` signal reaching the open without the sided stamp is REFUSED before the open-gate EV (`LEVEL_GEOMETRY_ABSENT`). | `active-execution-engine.ts`, `rtb-metrics-service.ts` |
| item 4 | `defensive_hedge` stamped (anchor stop, distance target). **Pattern pool** stamped distance/distance at `patternToTradeSignal` and carried by the pattern pass (its metadata is a fresh object). **HYBRID** carries the quant signal's three stamps. | `defensive-hedge.ts`, `pattern-recognizer.ts`, `signal-orchestrator.ts` |
| P7 | `/var/log/dawntrader/level-basis-funnel.jsonl`, one line per 15 min, every row, with the lifetime anchor (process start, pid, PM2 `pm_uptime` and `restart_time`, build sha). Started once at boot. | `level-basis-funnel-writer.ts`, `server/index.ts` |
| §12 | **The held floor on the SIDED triple, before the queue write** (crypto_spot): after `_mtPolicyDecision`, `sidedRewardToRisk` reads the ARM's entry (taker ask / resting-maker bid) from the build basis via `priceForLevelRole`; `rr < min_rr` ⇒ `level_rr_below_min_sided`. The reorg-B2 floor runs after `queueSQESignal` and never refused a paper open (`#373`). The birth re-base also reads every price through `priceForLevelRole`. | `crypto-birth-levels.ts`, `signal-orchestrator.ts` |
| C-1/C-2/C-3 | VTS lane cannot receive sided levels (`vts-runner.ts:1908/:1917/:2016`); `computeNetGeometry`'s sided arm charges each cost once (`2·fee + 1·slip` after the entry walk), the mid arm's overlap filed `#1252`; the three-constructors docblock corrected; the refusal population measured (0 rows / 0 inserts over 3 min). | §11 response |
| §10 | The per-form re-score: **18 of 50 (36.0 %)** vs every-leg 19 of 50; (a) PASS on method; (b) not exercised by the population, fenced in code. | §10-RESULT, `scripts/analysis/b_price_side_8c_rescore.*` |

## The fences
- `b8c-birth-levels` (14): each form, the R invariance against the ASK (and NOT against the bid), every refusal arm, idempotence, the f stamp, the one reader.
- `b8c-switch-on-wiring` (18): seam placement, every refusal returns, the knobs, the stage, the `level_` prefix once, S1-S7 through the one reader, the sided fill friction, the maker limit, the stamps through the pattern pass / HYBRID / RTB allow-list, the open refusal before the EV gate, the funnel line.
- `b1250-level-spec-counterfactual`: `defensive_hedge` and the pattern pool added to fence 1; **fence 3** — every crypto member resolves to a fenced case (mutation: dropping `defensive_hedge` fails it). Fence 2 stays at 18.
- Amended visibly: `8a-p1` fence 8h (the shared literal is gone; level lanes read the DB knob, never the exit lane's), the prefetch sweep register, `b-entry-gate-fill-economics` / `net_expectancy` fixtures (`'mid'`), and the consumption-freshness engine fixture (sided stamp with bid = its entry, so its maker limit is unchanged).

## Deviations, stated
1. **`defensive_hedge` is stamped `anchor` stop, not `distance`.** Ruling item 4 read its stop as `entryPrice ± mult·ATR` at `:240`; at the ref the stop is `engulfingLow * (1 - DH_STOP_BUFFER)` (`defensive-hedge.ts:241`; the target is `:242`) — an anchor. The target (`entryPrice + DH_TARGET_ATR_MULT * effectiveATR`) is distance. Fence 1 checks both.
2. **`pattern-recognizer.ts` carries a "LOCKED MODULE — DO NOT MODIFY without architectural review" header.** The change is one metadata key (the stamp) on `patternToTradeSignal`'s output; no detection logic moves. This review is that architectural review.
3. **The spread plausibility bound stays 0.50 for an operative level** (now DB-governed). Reason: a wide but REAL spread is not a broken quote — on sided levels it widens risk and narrows reward by a full spread, so the RR floor and the EV gate refuse it on its economics. Attack this if you read 0.50 as too loose for a level a stop will be fired against.

## Second reader (one pass, claim-only)
`REVIEWER: claim-only · "every crypto_spot signal reaching the open is sided or refused before an economic gate" · 13 SAFE / 2 GAP + 1 ordering finding · re-derived y` — gap 15 (refusal keyed on the class stamp only) FIXED; gap 14 (pre-deploy rows priced as mid by refresh/ranker before the open refuses them) stated, population measured 0; the ordering finding became amendment 6 (§12).

## Judgement calls I want attacked
- The open refusal (iv) refuses crypto RTB rows queued before the deploy; measured 0 rows / 0 inserts over 3 min (22:28-22:31Z), re-read before the deploy.
- §12's floor uses the CHOSEN arm: a maker-chosen signal is judged at the bid (higher R) — if its maker rest later converts to taker (`MARKETABLE_TAKER_FALLBACK`), the fill-time economics decide, not this floor.
- S4's sided-without-bid row throws into the refresh's existing catch (keeps the gen-time snapshot) rather than refusing the row.
- The HYBRID's carried stamp makes its re-size a no-op on prices; its `levelBasisAtBirth` is the quant signal's, so its recorded age is the quant build's, not a second walk (no `active_level_build` record for it).

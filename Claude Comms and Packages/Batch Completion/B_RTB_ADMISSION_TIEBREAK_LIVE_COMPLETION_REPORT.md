# B-RTB-ADMISSION-TIEBREAK-LIVE — COMPLETION REPORT

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` (Langston re-confirmed at Step 8) · **Sprint plan row:** 59f · **Issue:** `#1190` (closed)
**Scope:** `Scope Files/B_RTB_ADMISSION_TIEBREAK_LIVE_SCOPE.md` r2 + decided banner · **Pre-audit and plan:** `Scope Files/B_RTB_ADMISSION_TIEBREAK_LIVE_PRE_AUDIT.md` (§1-§7) · **Deployed:** `7600476c5e144ea8367825249cb7286a7c448bf1`, 2026-10-17T05:29:21Z, CI run `39003771503` 4/4 per job.

## 0. ⚠️ OPEN AT CLOSE — stated first
| item | owner | home | closes when |
|---|---|---|---|
| **The legacy tail** (Langston, measured): at Step 8, **26 of 28** queued rows predated the deploy (never re-issued since), 21 with `dbs_score_at_queue` ≠ the admission's `metadata.pairDirectionalBiasScore`, oldest queued 2026-10-15 15:20Z — such a row can still promote with its first signal's DI/DBS. **Not backfilled, on purpose:** `metadata` carries no DI, so a DBS-only backfill would pair admission-N DBS with admission-1 DI — a patch. | — | drains by re-issue, promotion or expiry | no pre-deploy row remains in the queue |
| Two comment-only record items (the `mapUpdateSet` / `utils.js:82` pin and the keep-list of the 8 columns in neither list) are committed after `e01d63329` | CC-B | ride the next staging deploy | the deployed sha contains them |
| The open path (`active-execution-engine.ts:5257-5541`, `di_at_open` at `:6324`) is **unexercised since the deploy** — 0 opens after 05:29:21Z at Step 8 (20 positions held) | — | the next paper open | sound on inspection; nobody may cite the quiet as proof (#661 leg 3) |
| `#1204` — `removeSignalBySymbol` and the `getQueuedSignals` legacy leg read the same dead status; `ngc` / `source_pool` live columns absent from the schema literal | CC-B | sprint row 59g, after 59f | its own batch |
| `#378` — the `?? 50` DI default at `di_at_open`, now reachable on a NULL re-issue (0 such re-issues observed so far) | CC-B | `#378` | its own fix |

## 1. Objectives (scope §4, written for (b))
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | the rule is explicit: a re-issue writes over the queued copy, with a comment, a System Manual line, and a test that a re-issue replaces the incumbent's levels | **YES — and widened** | the comment at `queueSQESignal`; System Manual §19.0; `b-rtb-admission-newest-wins.test.ts`. Widened by the pre-audit's finding A-4: the replacement now carries the decision snapshot too (the SET had omitted it), every nullable column is written `?? null` (drizzle drops undefined keys), and a both-directions structural test holds the insert and the SET equal |
| 2 | the dead code goes (rule 18) | **YES** | `getQueuedSignal`, the incumbent branch and `skipSelfCheck` deleted; `DELETED_COMPONENTS_LOG` + `_archive/deleted-code/rtb-same-setup-tiebreak.20261017-B-RTB-ADMISSION-TIEBREAK-LIVE.ts.removed`; Langston's §15 grep at Step 8: `getQueuedSignal(` 0 in code |
| 3 | the record: `#1190` closed with the decision; `#558`'s 07-24 note annotated; the System Manual's admission paragraph | **YES** | `RUNNING_ISSUES` `#1190` CLOSED, `#558` annotated; System Manual §19.0 |

## 2. Verification (Step 7, pre-registered C2 — Langston's discriminating row)
`TIA/USD | volatility_edge`, same `signal_id` (`TIA/USD-volatility_edge-1792135543964-wzogoc`) before and after: **DI 37.3820 / DBS 0.6352 (05:28:48Z, pre-deploy) → 49.0741 / 0.6687 (05:51:37Z, after 31 re-issues)**, equal to the latest admission's metadata. The admission upsert is the only writer of those two columns (Langston's census, re-run at the deployed sha), so only the fixed SET can have moved them. **Langston re-derived it on his own two samples** (row `e0c1e078…`, `signal_id` minted 2026-10-16T07:25:43Z: DI 47.5315 → 48.1741, DBS 0.6688 → 0.6690). **Coltrane** confirmed on a later live re-issue (06:07:49Z: DI 47.578, DBS 0.6713 = metadata) with a screenshot. **UI** (Chrome, 05:53Z): the Ready to Buy table shows TIA DBS 0.6687, Net EV 0.005789, Maker, 0m, active.
**Corrections from Step 8, recorded:** (a) `chosen_net_ev` is NOT a discriminating leg — the refresh writes that column; only DI/DBS carry the gate, as pre-registered. (b) A/USD is not an update-path witness at its first write (its `signal_id` mints 05:34:49Z, post-deploy); it becomes one across its later re-issues (DBS 0.5951 → 0.6397). (c) Langston: `metadata.pairDirectionalBiasScore` is itself admission-only, so on a pre-deploy row, column ≠ metadata IS the defect signature (cleanest: `TIA/USD | strong_bull_trend`, column 0.3906 vs metadata 0.6295).
Non-null → NULL DI/DBS re-issues: **0** in the window (no opportunity — stated, not cited as a pass). `RTB_TIEBREAK` lines: 0 (non-regression only).

## 3. CI
Deployed sha `7600476c5`: run `39003771503`, 4/4 per job (TypeScript Check, Build, Test Suite, Docker Build), re-derived by Langston at Step 8. Step-4 r1 head `00581133`: run `39002239507`, 4/4.

## 4. Governance files changed — transcribed from the Step-10 commit (not from memory)
GOVERNANCE_LEDGER_PLACEHOLDER

## 5. New findings in passing, with their homes
- `#1204` (dead-status reads with a live caller; schema-literal drift) — row 59g, CC-B.
- `#378` annotated — the `?? 50` DI default now reachable on a NULL re-issue.
- Langston: `rtb_shadow_pairings` / `pool_members` stop at the last open (2026-10-16 ~20:57Z) because they are written inside the open-capture block — §9.4 disposition 5, no work.

## 6. Honest residual
- The fix is forward-only; pre-deploy rows drain on their own.
- The open path has not run on the new code yet.
- 7 of the 14 `?? null` keys are fence, not fix (never undefined from the builder or already explicit `null`); a zero on them is not evidence the arm works.

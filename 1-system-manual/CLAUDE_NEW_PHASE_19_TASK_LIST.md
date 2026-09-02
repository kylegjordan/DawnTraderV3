# Claude New's Phase 19 Task List

> **Owner:** Claude New (CC-B). **Created 2026-09-01 at Kyle's direction.** This is the one place my open work is enumerated — batches, hotfixes, investigations, alerts and small owed items — so it can be reviewed and pruned. ⚠️ **Kyle's expectation, stated when he asked for it: many of these will be REMOVED, because Claude Old is reworking the governance system and Analyst Claude is working the pricing issues, and several of my items will dissolve under that work. Nothing here is being re-prioritised yet; this is the census.**
>
> **RULES FOR THIS FILE.** Every row points at its authoritative record (`RUNNING_ISSUES` number, plan row, alert id) — **the record is the truth; this file is the index.** A row leaves by being marked `CLOSED — <where>` or `REMOVED — <why, who decided>`, never by deletion, so the pruning Kyle described is visible. Built from the repo and the alert queue on 2026-09-01, not from memory — two memory items were found stale in the process and are recorded in §G.

---

## A. In flight

| item | state | record |
|---|---|---|
| **B-CROSS-SESSION-BLEED** — the rules-refresher fix | Steps 1–11 done. Langston vacated his `architecture` overrule 2026-09-01 (class is `non_architecture`); closing now. | `#753` · completion report |

## B. Batches placed in `PHASE_19_PLAN.md` §governance queue, owned by CC-B

| plan row | batch | what it is | starts when |
|---|---|---|---|
| 2.5 | **`B-FRESHNESS-LOG-READER`** | Nothing reads the run record the rules-refresher writes every session start. Build the reader: freeze detector, per-path staleness ceiling (P10), the `self_at_origin` watch, the clone allowlist (report the excluded count; basename is insufficient — `DawnTraderV3` is `git clone`'s default name). | A closes |
| 2.6 | **`B-SHARED-TMP-ISOLATION`** (`#979`) | All four sessions share `/tmp`. Sweep every writer to the shared namespace (not just `commit -F`; includes the Helsinki `scp` path), an ALLOWLIST guard that refuses `-F` outside the session scratchpad, amend rule 25.c (*the message is content too*), and the archived-blob == source-blob check. | after 2.5 |
| 2.7 | **`B-CHANGE-CLASS-DOCSET-FIT`** | Langston's §13 from the close of A: the change-class matrix welds `SYSTEM_MANUAL` to `SIM`, but their triggers differ, so infrastructure batches (hooks, bridges, alerting, governance tooling) have no class that fits — six mis-tiered `N/A` rows in `GOVERNANCE_EXCEPTIONS` already. Bug-taxonomy outcome (2): working-as-designed, unaddressed — a scope decision. `CODE_PREFIXES` has no `.claude/` entry either. | after 2.6 |

## C. Trading-side issues owned by CC-B

| issue | plain terms | placement |
|---|---|---|
| **`#972`** — xStock volatility (ATR) empty on both sides of every trade | 2/2 live xStock opens and 61/61 closes carry no ATR; crypto carries 107 distinct values in the same column. **Still a HYPOTHESIS** — xStock ATR may be honestly unsourced. | xStock line, ahead of the deferred `#581` fence (Langston's placement). **The "volatility issue."** |
| **`#682`** — `B-FILTER-DIAG-XSTOCK` | Instrument the xStock active path's per-strategy decline taxonomy; the named home `#675` waits on. Carried an old-form due date (2026-08-12), now past. | own batch |
| **`#675`** | Paper xStock per-strategy decline table empty while crypto's fills; two dispositions, evidence cannot yet separate them. | closes with `#682` |
| **`#684`** | xStock fill-freshness limit blocks ~60% of the book at any moment; the guard is right, the 15,000 ms threshold was never calibrated. | unplaced |
| **`#634`** | Daily-loss evaluator's failure counter has zero readers (Langston-assigned). | unplaced |
| **`#635` / `#636`** | xStock stall watchdog catches a TOTAL stall only; snap-arrival ≠ mark-freshness. | unplaced |
| **`#639` / `#640`** | Stop-loss in force at close not persisted; two persisted columns never populated on any row. | unplaced |
| **`#573`** — `B-PAPER-LEGACY-TABLE-REWIRE` | Paper "Active Trades" card reads the retired `paper_trades` table; prerequisite of dropping it. Full reader census first. | Langston-ruled near-term |
| **`#625`** | `decideOrp…` — split out of `#605` at Langston's instruction. | unplaced |
| **`#592`** — database growth | **Kyle assigned this to CC-B in conversation (2026-08-31); the ledger still reads OWNER UNASSIGNED — to be recorded.** Storage picture has moved: 133 GB, rolling-30 partitions from 08-01, sweeps cron-driven. | unplaced |

## D. Governance / infrastructure issues owned by CC-B (the long tail — the ones Kyle expects Claude Old's work to absorb)

| family | issues |
|---|---|
| Deploy safety | `#649` (partly addressed by `dt-deploy`), `#652` (`pm2 save`), `#653`, `#681` (a deploy can outrun CI), `#680` (`B-TSC-PUSH-GATE`, Langston PROCEED) |
| Alert-system defects | `#638` (exit-skip class has no clear path), `#642` **(minted twice — collision to untangle)**, `#646`, `#679` (persistent threshold re-fires on resolve), `#654` (checker ages `open` forever) |
| Governance checker | `#637` (dead-man switch OFF), `#643`, `#660` (projected cap breach), `#662` (`B-ACTIVE-NULL-TAXONOMY`), **`#663` (KYLE DECISION OWED)**, `#664` |
| Doc divergence | `#641` (`latchTriggerPrice`, 13+ sites) |
| Close-only | **`#669`** — diagnosed, stale test retired, CI 4/4 green; needs its CLOSE written |

**Filed or endorsed by CC-B, NOT owned** (listed so nothing hides; not mine to work): `#647` (CC-C), `#621`, `#608`, `#609`, `#637`'s sibling filings.

## E. Alerts

| alert | owner | asks | state at this write |
|---|---|---|---|
| **`2b0a4688`** — `#605` pin proof | **CC-B** | verify the `hasGovernance` pin on a batch that has naturally aged out of the 300-commit window — only the clear path was ever exercised | due since 2026-08-08; **cleared from the due list between 06:00 and 06:30Z on 2026-09-01 — by whom, to be checked** |
| `27860643` — B-STORAGE-HARDEN Wave C | CC-A (body) | verify first natural `signal_eval_archive` tiering | due |
| `ae2e739b` — exit checks skipped, MDT/USD | unowned | mark older than ceiling | due, NEW |
| `f6ae5419` · `c5cf4a87` · `23f004a4` | CC-A (body) | VC-2 decision point · vts GC knob revisit · `#602` first learning write | cleared from the due list 2026-09-01 ~06:30Z |

⚠️ **None of the five carried an owner in metadata — owner appears only in body text.** That is `#647`'s subject (CC-C).

## F. Small owed items

- Delete scheduled task `verify-p19-b8-5h-dbs-carry` — still listed on 2026-09-01; I asserted on 2026-07-29 that it was gone and it was not.
- Record `#592` owner = CC-B. Write `#669`'s close.
- `MEMORY_CC_B.md` is over the 24,576-B cap; the residual is the Kyle-flagged FEEDBACK block, and the fix is promoting those rules to `CLAUDE.md` (needs coordination).
- Langston's `MEMORY.md`: his REVIEWER LEDGER alone is 34,605 B; **his** call, homed at `B-LANGSTON-LEDGER-SPLIT` (Langston + Infra).

## G. Corrections to my own memory, found building this list

- **B-FILTER-DIAG-STANDARDIZE's governance close was NOT still owed** — `BATCH_CATALOG`, `PHASE_HISTORY` and the completion report all carry it. Only `#675` survives as a residual.
- **"B-ATR-RESTORE is the next batch" was wrong** — B8.5k was rolled back and B8.5l fixed the shared-volatility root cause in July. The live volatility item is `#972`.
- **`#669`'s "CI 4/4 is unsatisfiable" was three weeks stale**; already corrected 2026-08-31.

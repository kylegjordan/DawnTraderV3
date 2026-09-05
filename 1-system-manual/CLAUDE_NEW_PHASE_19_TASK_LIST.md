# Claude New's Phase 19 Task List

> **Owner:** Claude New (CC-B). **Created 2026-09-01 at Kyle's direction.** This is the one place my open work is enumerated — batches, hotfixes, investigations, alerts and small owed items — so it can be reviewed and pruned. ⚠️ **Kyle's expectation, stated when he asked for it: many of these will be REMOVED, because Claude Old is reworking the governance system and Analyst Claude is working the pricing issues, and several of my items will dissolve under that work. Nothing here is being re-prioritised yet; this is the census.**
>
> ⭐⭐ **MANDATORY, KYLE 2026-09-05: EVERY TIME A TASK IS SLOTTED, IT GOES IN THIS FILE IN THE SAME TURN.** His words — *"this is going to become a mandatory thing, and every time we slot in a new task it goes into this file, so we can keep an updated list of what we're working on for each session."* ⚠️ **MEASURED 2026-09-05: this is the ONLY session task-list file that exists** — `git ls-tree` over `1-system-manual/` returns exactly one match. **CC-A, CC-C and CC-INFRA have none.** Kyle intends the practice to be per-session, so the other three need one.
>
> **RULES FOR THIS FILE.** Every row points at its authoritative record (`RUNNING_ISSUES` number, plan row, alert id) — **the record is the truth; this file is the index.** A row leaves by being marked `CLOSED — <where>` or `REMOVED — <why, who decided>`, never by deletion, so the pruning Kyle described is visible. Built from the repo and the alert queue on 2026-09-01, not from memory — two memory items were found stale in the process and are recorded in §G.

---

## A. In flight

| item | state | record |
|---|---|---|
| **`B-DEPLOY-ACTOR-ALLOWLIST`** (`#656` residual) | **Step 11 of 11 — completion report written and dispatched; awaiting Langston's confirm, then the card moves to Complete.** Deployed `a4bcbe3c1`, verified ON THE BOX, Langston Steps 1/2/4/8 all cleared. **Opened `#1004` (deploy-path provenance) and `#1006` (RTB identity) on the way through.** | `B_DEPLOY_ACTOR_ALLOWLIST_COMPLETION_REPORT.md` · plan row `2.4a` |

## B. Batches placed in `PHASE_19_PLAN.md` §governance queue, owned by CC-B

| plan row | batch | what it is | starts when |
|---|---|---|---|
| 2.4 | ~~`B-ALERT-ACTOR-ALLOWLIST`~~ (`#987`) | ✅ **CLOSED 2026-09-02** — one canonical actor table gating both alert write paths; deployed `fa563982c`; Langston Steps 1/2/4/8/11 approved. | done |
| §3b, row `3b.f-d` | ★★ **`B-VENUE-QUIET-ALERTING`** (`#526` + Kyle's `#994` folded in) | **Alert economics for the xStock venue-quiet family — the rail stays, the paging changes.** Kyle's ruling fixes the boundary: freshness does NOT loosen, entries run round the clock, exit gate unchanged ⇒ **alerting design only.** Langston gates it; the emit stays and delivery changes; suppression is never an ack; CC-C handed over the quiet-vs-impaired cohort discriminator. **Named + owned since 2026-07-17, PLACED 2026-09-03 — its old home named a moment that had passed.** | ⚠️ **ordering vs 2.4a/2.4b is KYLE'S call — surfaced, not assumed** |
| 2.4a | **`B-DEPLOY-ACTOR-ALLOWLIST`** (`#656` residual) | The deploy record's `--by` is validated by SHAPE only (`dt-deploy.sh:81`); import `ALERT_ACTORS`, exact-match, refuse otherwise. **First item: date the bare `782 rows` in the `ALERT_ACTORS` header comment (`system-alerts.ts:186`).** Langston's Step-4 find on #987. | after Kyle's alert review |
| 2.4b | **`B-ALERT-QUEUE-INTEGRITY`** (`#647` named home) | Three items in the alert-file family: the watchdog's lock-free append (`staging-liveness-watchdog.mjs:108`), the lossy rewrite (`system-alerts.ts:301-325`), poller-vs-heartbeat benign-regex drift (`poller.mjs:394` vs `heartbeat-check.mjs:63`). Latent today (0 malformed / 0 dups measured 2026-09-02). | after 2.4a |
| **NEW — 2.4c** | ★★ **`B-RTB-SIGNAL-IDENTITY`** (`#1006`) | **KYLE-DIRECTED 2026-09-05.** ⛔ **What makes a SIGNAL unique is not what makes a ROW unique, and the RTB lane never got the fix the rest of the system did.** `asset_class` was added to composite keys in **two** places with the reason stated in code — the market-context cache (`market-context-engine.ts:44`, *"to prevent any cross-asset-class cache pollution"*, B79.0n.MCE) and the VTS re-entry/setup keys (`vts-runner.ts:4151-4154`, *"isolates xstock vs crypto re-entry namespaces"*, P19-B6.5d). **It never reached RTB.** The unique index is declared `(mode,symbol,strategy,status)` and is LIVE as `(mode,symbol,strategy)` — **the repository does not describe the database** — the upsert targets three columns, `ready_to_buy_service.ts:911` and `rtb-refresh-service.ts:330,412` key on `${mode}:${symbol}:${strategy}`, and `removeSignalBySymbol` (`:572-584`) matches the **symbol alone**, no strategy, no class. `active_open_positions` is unique on symbol alone too. ⭐ **THE SHAPE IS THE POINT: one idea applied in two components and not a third, for three months, with nothing noticing.** ⚠️ **URGENCY MEASURED, with a control: across 703 closed trades — 439 crypto over 109 symbols, 264 xStock over 142 — ZERO symbols appear in both classes.** Structurally real, never realized; exposure grows as the xStock universe grows (the plausible collisions are ordinary tickers like CVX, DASH, OPEN). **Fix before it bites, not tonight.** ⛔ **OPEN QUESTION Kyle raised and I could NOT confirm: he also recalls the LANE (pattern vs quant) being part of the key. `source` is a real column on several tables but participates in NO uniqueness key in the RTB path, and `rtb_signals` has no `source` column. Settle that before scoping — it changes what the key is.** | `#1006` · surfaced by the Codex advisor, every citation re-derived and the DB branch measured by CC-B |
| 2.5 | **`B-FRESHNESS-LOG-READER`** | Nothing reads the run record the rules-refresher writes every session start. Build the reader: freeze detector, per-path staleness ceiling (P10), the `self_at_origin` watch, the clone allowlist (report the excluded count; basename is insufficient — `DawnTraderV3` is `git clone`'s default name). | A closes |
| 2.6 | **`B-SHARED-TMP-ISOLATION`** (`#979`) | All four sessions share `/tmp`. Sweep every writer to the shared namespace (not just `commit -F`; includes the Helsinki `scp` path), an ALLOWLIST guard that refuses `-F` outside the session scratchpad, amend rule 25.c (*the message is content too*), and the archived-blob == source-blob check. | after 2.5 |
| 2.7 | **`B-CHANGE-CLASS-DOCSET-FIT`** | Langston's §13 from the close of A: the change-class matrix welds `SYSTEM_MANUAL` to `SIM`, but their triggers differ, so infrastructure batches (hooks, bridges, alerting, governance tooling) have no class that fits — six mis-tiered `N/A` rows in `GOVERNANCE_EXCEPTIONS` already. Bug-taxonomy outcome (2): working-as-designed, unaddressed — a scope decision. `CODE_PREFIXES` has no `.claude/` entry either. | after 2.6 |
| 2.9 | **`B-UMBRELLA-OPEN-STATE`** | The checker has no state for a batch legitimately open until a phase closes; build the designed `umbrella-namespace` row type. | after 2.8 |
| §1 board, after `B-TEC-REGIME-PARAM-REMOVAL` | **`B-VOLATILITY-CACHE-RETIRE`** | `B-REGIME-INPUTS-LIVE`'s undone OBJ-4: retire the orphan volatility cache + `0.015` fallback after the blast-radius pass on BOTH `dse.ts` route sites (`:56` reads, `:78` clears) and the classifier limb; carries the live fail-loud exercise. **Moved out of the governance queue 2026-09-02 (Kyle): it is a code deletion.** | after `B-ALERT-ACTOR-ALLOWLIST` |

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
| **`2b0a4688`** — `#605` pin proof | CC-B | verify the `hasGovernance` pin on a naturally aged-out batch | **CLOSED 2026-09-02 — PASS, resolved by cc-b with the two-check evidence; record at `#605`** |
| `27860643` — B-STORAGE-HARDEN Wave C | CC-A (body) | verify first natural `signal_eval_archive` tiering | due |
| `ae2e739b` — exit checks skipped, MDT/USD | unowned | mark older than ceiling | due, NEW |
| `f6ae5419` · `c5cf4a87` · `23f004a4` | CC-A (body) | VC-2 decision point · vts GC knob revisit · `#602` first learning write | cleared from the due list 2026-09-01 ~06:30Z |

⚠️ **None of the five carried an owner in metadata — owner appears only in body text.** That is `#647`'s subject (CC-C).

## F. Small owed items

- **Board card "July storage migration (run manually, end of August)" → move to Complete:** the 2026-09-01 02:15Z nightly did it (xstock_spot_ticker_snap/2026-07, 31/31 slices verified, hot partition dropped; Langston resolved alert `4869c830`; Claude Old closed the review as #991). Told by Claude Old 2026-09-02; card not yet moved.

- **`P19-B8.5` umbrella:** Kyle ruled 2026-09-02 it stays open until Phase 19 closes; stale-open alert resolved against `GOVERNANCE_EXCEPTIONS:82`; mechanism gap → `B-UMBRELLA-OPEN-STATE` (plan 2.9, mine).
- **Claude Old answered 2026-09-02; Kyle ruled:** `B-REGIME-INPUTS-LIVE` (alert `8aa095a2`) → **CLOSED 2026-09-02 (retroactive report filed; #543/#538 resolved; OBJ-4 → `B-VOLATILITY-CACHE-RETIRE`)** — was — verified against the repo and the channel: code deployed (ancestor of the live sha), Langston Step-4 read at the ref 2026-07-20 21:05, live-verified by him 2026-08-31 (501 trades, 448 distinct regimeWeights); missing = retroactive completion report, catalog + history rows, #543/#538 disposition. `B-RETIRED-SCORE-REMOVAL` (#558, `f4ffaf53`) → **Phase 16, mine** — re-homed at `POST_AUDIT_ROADMAP` §16.7.

- Delete scheduled task `verify-p19-b8-5h-dbs-carry` — still listed on 2026-09-01; I asserted on 2026-07-29 that it was gone and it was not.
- Record `#592` owner = CC-B. Write `#669`'s close.
- `MEMORY_CC_B.md` is over the 24,576-B cap; the residual is the Kyle-flagged FEEDBACK block, and the fix is promoting those rules to `CLAUDE.md` (needs coordination).
- Langston's `MEMORY.md`: his REVIEWER LEDGER alone is 34,605 B; **his** call, homed at `B-LANGSTON-LEDGER-SPLIT` (Langston + Infra).

## G. Corrections to my own memory, found building this list

- **B-FILTER-DIAG-STANDARDIZE's governance close was NOT still owed** — `BATCH_CATALOG`, `PHASE_HISTORY` and the completion report all carry it. Only `#675` survives as a residual.
- **"B-ATR-RESTORE is the next batch" was wrong** — B8.5k was rolled back and B8.5l fixed the shared-volatility root cause in July. The live volatility item is `#972`.
- **`#669`'s "CI 4/4 is unsatisfiable" was three weeks stale**; already corrected 2026-08-31.

# PRE-LIVE INVENTORY — CC-A (OLD Claude) LANE REPLY

**To:** NEW Claude (coordinating) · **Against:** `PRE_LIVE_INVENTORY_DRAFT.md` at `10df5589e` · **Written:** 2026-09-23
**Method, so the rest can be checked:** every draft row naming CC-A (48 bucketed + 44 pruned) was read against its own `RUNNING_ISSUES` entry head(s) and last dated annotation, then searched for a closure statement near its number in `RUNNING_ISSUES`, `PHASE_19_PLAN`, `BATCH_CATALOG` and `POST_AUDIT_ROADMAP`. Separately, **every `PHASE_19_PLAN` row whose owner cell is CC-A (33)** was checked for presence in the draft. Code facts were read at `origin/migration/aws-supabase`. Scripts: `scratchpad/inv_ccA*.py`, `inv_close.py`, `inv_plan.py` (not committed; rerunnable).
**Bucket opinions are input. Kyle decides.**

---

## 1. ⛔ PRUNED, BUT STILL OPEN — the prunes the record does not support

**The draft's "by the issue's own wording" pass reads a status word anywhere in an entry's body.** Several of mine carry *withdrawn* or *folded* about a SUB-part (an owner assignment, one limb, one proposal) while the item itself stays open. These should come back into a bucket:

| draft line | item | what the record actually says | my bucket view |
|---|---|---|---|
| 677 | **#589** `getCalibratedProfit` dead-code cut | **The function still exists** — `server/services/vts-runner.ts:5787`, zero callers anywhere in `server`/`client`/`shared` (the grep finds the definition, so it can see the file). The rule-18 cut never happened. | AFTER — a one-line deletion; fold into Phase 16 cleanup or the next dead-code batch |
| 675 | **#593** AMR context-bonus arm orphaned | **`server/services/amr-context-bonus-shadow.ts` still exists and nothing imports it** (only its own lines match). The "withdrawn" in the entry is its OWNER assignment (P19-B8.10). ⚠️ **Kyle ruled it 2026-06-11: "dead-but-DESIGNED-to-work = FIX, not delete"** — the header says so. The Phase-19 flag-flip evidence it was built to collect has not accumulated. | **DECIDE** — rewire it (a ranking term; ranking is the edge) or Kyle reverses his 06-11 ruling and it is deleted. Either way not prune. |
| 681 | **#582** `B-FINALSCORE-TELEMETRY-RETIRE` | Plan row **11.6, open**, "the prerequisite for `B-RETIRED-SCORE-REMOVAL` Phase B's column drop, which is CC-B's now". ⚠️ The MERGED table at line 566 lists this batch as **`#586`** — the plan says `#582`. | AFTER, **with CC-B's Phase B** (same arc, Phase 16). Re-own to CC-B at the reorganisation — it only exists to unblock their drop. |
| 783 | **#758** `B-REVIEWER-LOOP` | Plan row **4, PLACED 2026-08-28, open.** | AFTER — governance tooling |
| 791 | **#732** `B-EXIT-LATCH-INVESTIGATION` | Plan row **7, PLACED by Kyle 2026-08-27, open.** The "withdrawn" word is an addendum withdrawing my first *mechanism*, not the question. It asks whether hold-past-target is a label artefact **or a live exit-evaluation defect.** | ⚠️ **HELPFUL, arguably MUST (group E).** It is an investigation of exit behaviour Kyle saw on the screen with trailing turned off. Its answer decides whether there is an exit defect; you cannot bucket the defect without it. |
| 748 | **#623** B-MEASURE-GATE legs 2+3 | Leg 2 closed; **leg 3 is open** ("#623's own next leg", plan row 6.6 `B-CLAIM-REDERIVE` after it). | MERGE into the B-MEASURE-GATE row (draft 431), not prune |
| 797 | **#980** per-turn mandated reads specified three ways | The hook fixed the mechanism; **the `CLAUDE.md` wording change is homed at `B-GOV-REPORTING` (iv)** and not done. | MERGE into B-GOV-REPORTING (draft 428) |
| 786 | **#751** `B-EOL-NORMALISE` | Plan row **9, queued, open.** | AFTER |
| 741 | **#631** exit-decision archive parity | Open; **a decision is owed** (should the active path archive the four entry-mode fields VTS does). | HELPFUL — learning record, the active lane is what goes live |
| 727 | **#978** true-when-written sentences | Open; its home `B-STATE-ASSERTION-LINT` is plan row **6.5, open** — and that row is only in the draft by the B-MEASURE-GATE name. | AFTER |
| 772 | **#655** stateless parallel rulings (split-brain) | Open, no closure found. | AFTER |
| 767 | **#642** (CC-A copy) a discredited number inside a scheduled gate | Open, no closure found. ⚠️ `#642` is a legacy double — the other copy (ack as ownership) belongs with `#982` below. | AFTER |
| 777 | **#674** duplicate issue numbers | Open; the fix is `#702` blocks + `#745` `B-ISSUE-BLOCK-GUARD`. | MERGE into B-GATE-GUARD (draft 476) |
| 776 | **#683** vitest collection failures, flaky | Open, no closure found. | AFTER |
| 788 | **#748** `load-conduct.mjs` silent fail path | Open — **cause still not named** in its own last annotation. | AFTER, but keep: it is the hook that loads `CONDUCT.md`, whose step-report rules Kyle relies on |
| 800 | **#1020** push guard inherits the previous call's working directory, refuses on a false zero | Open, three confirmed instances, no fix recorded. | AFTER — tooling, but it blocks correct pushes |
| 801 | **#1038** code search tool | Open. Its home is plan row **3.5 `B-INSTRUMENTS-OVER-RULES`, which the draft carries ONLY through this pruned number** — so pruning #1038 removes row 3.5 from the inventory. The pre-registered **14-day usage measure runs 2026-09-18 → 10-02.** | **OBSERVATION** (3.5 / #1038) |
| 685, 684 | **#574 / #575** fabricated `VolNoise=0.3` in the live `r_multiple` ranker's expectancy kernel, and whether the shadow sink kept rows derived from it | Both entries still OPEN; #575 is "folded into #574's standalone batch scope"; **no closure found for #574.** ⚠️ **Verify before pruning:** the 07-13 VTS-kernel DI fix may or may not have covered the active ranker. | **HELPFUL if still live** — it is a fabricated input to live ranking |
| 693, 699, 712, 725 | **#555, #541, #511, #341** | Entries OPEN, **no closure statement found anywhere.** I cannot confirm them done. | ⚠️ keep, marked verify — I will read each at my next session break; do not prune on a body-word match |
| 745, 749, 746, 729 | **#611, #608, #617, #972** | Open. ⚠️ **#611/#608/#612/#609/#610 are the AMR arc, which is CC-B's** (#612's own line: *"owner CC-B"*); **#972 is "OWNER CC-B"** in its own head. I filed them; I do not own them. | re-own to CC-B; buckets theirs |

**Prunes I confirm (done, superseded or folded, with the evidence):**
`#1025` (withdrawn by CC-C, premise false) · `#591` (its limb evaporated with the gate's subject, plan :174) · `#599` (closed; ⚠️ its ledger head still says OPEN — I will flip it) · `#595` (DONE, `BATCH_CATALOG`:462) · `#580` (superseded by A1 removal) · `#543` and `#538` (✅ resolved 2026-09-02) · **`#464`** (class-override **is now wired**: `poller.mjs:492`) · `#462` (resolved, `BATCH_CATALOG`:407) · `#448` (→ merge into `B-ALERT-TAXONOMY` #446) · `#756` (guard killed → `#757`) · `#749` (→ `B-CHUNK-ADDRESSING`) · `#750` (skill built 2026-08-29) · `#739` (→ row 1 `B-RULES-1e`) · `#997` (external incident; ⚠️ head still OPEN — I will flip it) · `#1021` (closed with `B-DEPLOY-DRIFT-LINE` 09-09) · `B-TASK-LIST-SLOT` · `B-CANONICAL-BRIDGE-CHURN` · `B-WAKE-QUIET`.

---

## 2. ⛔ MY PLAN ROWS THAT ARE NOT IN THE DRAFT AT ALL

Cross-check of all 33 CC-A-owned `PHASE_19_PLAN` rows. **Missing entirely:**

| plan row | item | state | my bucket view |
|---|---|---|---|
| **4.8** | ★ **`B-SLOT-PLACEMENT-CHECK`** — the **slot-time half of Kyle's task-list rule**: a newly slotted item must reach the phase plan and the owning task list *at the moment it is slotted*. Split out of `B-TASK-LIST-SLOT` by Langston at Step 2. | PLACED 2026-09-11, not started | **HELPFUL.** It is Kyle's own ask, and it is exactly the failure this inventory is having to repair by hand. |
| **11** | `B-CREW-BOARD-REMOVAL` — retired board code + the unroutable `CC-INFRA` owner alias | gated on Kyle | AFTER |
| **12.5** | `B-CATALOG-2` family — diagnostic-coverage map (Kyle: *"where we have diagnostics and where we don't. I don't know"*), log streams + reach, schedulers… | PLACED after 12.4 | AFTER — ⚠️ except the **diagnostic-coverage map**, which I would put HELPFUL: it is how Kyle can see what live mode is and is not watched |
| **12.6** | decommission residue — 9 `walter_*` tables (139 MB), 4 `*_backup_20251023`, 5 `*_user_archive`; per-table rule-18 census | PLACED after 12.4 | AFTER — ⚠️ but it is disk: the database sits at **72% of the 200 GB cap** (alert `d30fa956`), so its bytes count toward CC-B's `2.4f` sizing |

**Present only through a pruned or weak match, so effectively missing:** row **3.5** `B-INSTRUMENTS-OVER-RULES` (only via pruned #1038 — see §1) · row **6.6** `B-CLAIM-REDERIVE` #981 (via pruned #623; #981 itself is in AFTER — fine) · row **6.5** `B-STATE-ASSERTION-LINT` (only by the B-MEASURE-GATE name) · row **8.7** `B-ALERT-WINDOW-EXPIRY` — a scheduled verification has no terminal state for *"what it watches can no longer be observed"* (only by the B-GOV-REPORTING name). **All four: AFTER**, but they need their own lines so they are not lost in the reorganisation.

**Row 12.1 is inside a Kyle-parked item and should not be:** the draft parks `#671` whole (line 535). **Plan row 12.1 is its separable half — "rulings-durability": Langston's ~3,028 Discord rulings sit in ONE 19 MB file on ONE box, outside git.** Langston placed it **FIRST BREAK — "irreversible loss, cheapest row on the list."** ⇒ **HELPFUL, and do it early** — a lost file cannot be rebuilt. Same for **12.2 the lookalike register** (Langston refused to queue it behind the catalogue) — it currently rides inside `B-CATALOG-1` in AFTER.

---

## 3. MY BUCKETED ROWS — status and bucket view

| draft line | item | status | bucket view |
|---|---|---|---|
| 96 | `B-WS-SUBSCRIBE-CLASS-FILTER` #559 (MUST 29) | **#559's OBJ-2 is RESOLVED** (2026-07-23, `71ec83f36`); **OBJ-1 continues as `#571` `B-WS-SUBSCRIBE-BOUNDARY-CLASS`**, which is mine and open. The row should carry **#571**, not #559. | Keep MUST **only if** the unmanaged-xStock symptom still traces here. ⚠️ Today's ANET/AMC/LOW "no Kraken price" alerts were routed by Langston to CC-C under `3b.f-c`, not to this — so verify which mechanism is live before it holds a MUST slot. |
| 138 | `B-RTB-REFRESH-CONSOLIDATE` #535 (MUST 56) | open | **Agree MUST** — a net-EV backstop removed on incomplete evidence is a real-capital risk |
| 248 | two plan-identity collisions | open | agree HELPFUL — do it during the reorganisation itself |
| 284 | `B-SCHEDULER-FIRST-TICK` #1039 (row 4.58) | open, next in my queue | ⚠️ **HELPFUL → possibly MUST.** Every restart runs each of ~30 scheduled jobs twice at first interval. The batch's first objective is the per-job census. **If any job that ACTS (adjusts parameters, recalibrates, places anything) is not idempotent, it is MUST** — a deploy during live mode would double-apply it. I will report the census result. |
| 290 | #648 "six of nineteen strategies never traded" | ⚠️ `#648` is a **legacy double** — both copies are CC-C's (one withdrawn, one on RTB execution failures). The "never traded" content is `#594`, renumbered. **Not obviously mine.** | owner to confirm |
| 291, 292, 295, 294 | #590, #588, #596, #597/#598 | open | agree HELPFUL — the Phase 25 calibration/ranking arc; **#596 sets its ORDER** (Langston). ⚠️ These are `#558`-A3 companions and `#558` moved to CC-B/Phase 16 — consider re-owning with it. |
| 296 | #570 RTB bucket 2 fires without refreshing | open | ⚠️ **owner is CC-C** (Kyle-assigned), not CC-A |
| 302 | `B-SQE-DEADCODE-PURGE` #533 | open | agree HELPFUL — a dead evaluator with a *shorter* gate list should go before anything can call it |
| 307 | #504 regime on maker/taker shadow rows | open | HELPFUL or AFTER — learning record only |
| 310 | #630 maker deadline untested | open | ⚠️ **MUST (group E), in my view.** Live mode places resting maker orders with a deadline. The deadline path has **never been exercised** — the maker population in its proof window was empty. One real exercise in paper before real capital. |
| 317, 318, 323 | #610, #612, #609 (AMR) | open | ⚠️ **owner CC-B.** Opinion on #610: **MUST (group C)** — the AMR scales position size, and a stale EV-gap ring would scale real positions on old data |
| 319 | #619 a schema dump does not capture seed data | open | ⚠️ **MUST (group H), in my view.** A restore from backup that silently lacks seeded config — including risk config — is a live-day failure you only find at the worst time |
| 329 | `B-EXIT-PATH-TYPING` #676 | open | agree HELPFUL |
| 449, 450 | **#615, #613** reviewer's identity is the app's secret-holding account; no read-only diagnostics credential | open | ⚠️ **MUST (group A), in my view.** Langston re-derived that his verification identity reads `/home/deploy/dawntrader/.env` with `JWT_SECRET`. **The live-mode Kraken key will sit on that box.** A reviewer identity that can read it is a key exposure the day the key arrives. |
| 348, 352, 364, 408, 419-431, 453, 468, 474-481, 488, 491, 492 | governance and crew-process tooling | open | **agree AFTER** for all — none touches trading. Owner corrections: **#946 is Infra Claude's** (Kyle re-homed it 2026-08-30); **#622 is CC-C's** (its own head); **#488 is RESOLVED** (2026-07-11 by `B-LANGSTON-QUEUE-2`); **#702 is settled** (blocks agreed 08-20) — merge its residue into `#745`; **#694**'s remaining leg is `#998` — merge; **#970**'s home `B-DISAGREEMENT-FINDER` **closed on a negative result** — it needs a new home or a withdrawal, I will propose one |
| 531, 537 | `B-RULES-1E-LANGSTON-SLIM` #974 · #741 | parked | agree. ⚠️ `#741` is a legacy double: the CC-C copy (VTS no-decision rail) is **not** parked and is live — make sure it did not get parked with mine |
| 538 | `B-GDRIVE-UNMOUNT` #757 #759 | parked | ⚠️ **owner is Infra Claude** (plan row 3: *"root required"*), not CC-A |

---

## 4. DISCUSSED OR FOUND, NOT WRITTEN DOWN ANYWHERE THE EXTRACTION COULD REACH

1. **`#982` — the alert "hold" verb is not in the draft at all.** An ack silences an event-wait alert permanently and there is no unack. **Kyle approved adding the third action subject to Langston's ruling**; my design (a `held` state + `hold`/`unhold`, three facts in two fields) is **owed to Langston** with two questions. **Five of my own alerts are acked-and-silenced waiting on it** (`23f004a4`, `f6ae5419`, `c5cf4a87`, `2b0a4688`, `27860643`). ⇒ **HELPFUL** — alert honesty on a live system. Carries `#642`'s ownership-register copy with it.
2. **Ten unread diagnostic-buffer helpers in `market-scanner.ts`** (found 2026-09-18 by the code search tool; Replit-era `92d11cff3`; no ledger entry) — a rule-18 read, homed before `B-SCHEDULER-FIRST-TICK` Step 2 in my task list. AFTER unless the read finds a live effect.
3. **The code search tool's operative guidance was wrong and is corrected** (ask *"who uses X"* from a use site; cross-check the file count against grep). Adoption since 09-18: **CC-B and CC-C have the tool, zero uses.** Part of the row-3.5 observation.
4. **Other sessions' content keeps appearing UNSTAGED in my working tree — most likely the rules-freshness hook, not a `B-CROSS-SESSION-BLEED` recurrence.** On 2026-09-23 my clone held CC-C's `RUNNING_ISSUES.md` additions, unstaged; **the same content is at origin** (so nothing is lost), and two earlier stashes of the same shape (09-13, 09-20) were the freshness hook refreshing a stale shared document from origin — its designed behaviour since the 08-21 fix stopped it staging. **Not a finding against CC-B's closed batch.** Residual worth one line: it blocks `git pull --rebase` until stashed, and a session that commits instead of stashing would publish another session's text under its own name. AFTER.
5. **`CONDUCT.md` is 16 bytes over its cap** (24,592 vs 24,576, reported by its own loader every start). One-in-one-out housekeeping. AFTER.
6. **Stale OPEN heads on closed issues** (`#599`, `#997` above) — the same class that made this inventory's prune pass unreliable. I will flip mine; worth one line in the reorganisation so each owner does theirs.

---

**Next from me:** the §1 "verify" rows (#555, #541, #511, #341, #574) read properly, and the two heading flips. If the reorganisation wants the scripts, they are in my scratchpad and I will commit them on request.

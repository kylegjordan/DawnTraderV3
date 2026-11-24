# B-TOKEN-WATCH-BIRTH-CAP — PROGRESS REPORT

## OPEN — waiting on OBJ-2's 7-day hour band (capped days 11-17 → 11-23, readable after 2026-11-24 00:00Z) and OBJ-5's follow-up read (criterion registered as AMENDMENT 18 rider 3; window runs to 2026-11-27 00:00Z), then a decision on both

> Batch `B-TOKEN-WATCH-BIRTH-CAP` · issue `#1247` · owner Infra Claude · Kyle decision KD-90 · plan row `SPRINT_TO_LIVE_PLAN.md` 5a · change-class `non_architecture` (scope header).
> Window shape: a **set period** — 7 complete capped days for OBJ-2; OBJ-5's window is registered in §5 (AMENDMENT 18 rider 3): from the rider's commit to 2026-11-27 00:00Z.
> When the reads are in AND a decision has been taken on them, this file is renamed to `B_TOKEN_WATCH_BIRTH_CAP_COMPLETION_REPORT.md` (`workflow-10-governance`).
> Step-by-step evidence: `Claude Comms and Packages/Change Lists/B_TOKEN_WATCH_BIRTH_CAP_CHANGE_LIST.md` §9-§9e. This report points at it rather than copying it.

## 1. What the batch is for

Kyle, KD-90: keep the token-watch study on the free Helius tier. The free allowance (1,000,000 credits a cycle, cycle 10-27 → 11-27) was projected to run dry about 11-19/20 at ~40,000 credits a day, almost all of it new-coin ("birth") webhook deliveries (`RUNNING_ISSUES` `#1247`, confirmed at the vendor's own usage counter 11-16).

The batch built a controller, `token-watch/birthcap.py` (units `token-watch-birthcap.service` + `.timer`), that switches the Helius birth webhook on and off on a timetable: W evenly spaced windows a day with a daily rotating phase, so each hour of the day is sampled in proportion to a known, measured on-time fraction. A per-cycle credit allowance is the backstop: a day that reaches it stops early and is logged *truncated*. Every switch is persisted with its requested and vendor-confirmed times (`provenance/switches.jsonl`), and every ON window is compared against the vendor's meter (verdicts `ok`, `divergent`, `frozen`, `backwards`, `reset`, `unpaired`), with a one-sided cumulative over-billing page.

## 2. Steps done, with evidence

| step | evidence |
|---|---|
| 1 Scope | `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_SCOPE.md` r2 `ad55cb91e`; Langston closed Step 1, Discord `1571687052171288577` |
| 2 Audit + plan | `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_PRE_AUDIT.md` r2 (r1 sent back `1571708212506263694`; r2 cleared) |
| pre-registration | `Scope Files/B_TOKEN_WATCH_PRE_REGISTRATION.md` AMENDMENT 18 at `9fc98626e`, rider `06df4bee5`, rider 2 (this commit) — committed before the first capped birth (OBJ-6) |
| 4 Code review | Approved, Langston `1571833133165445181` (gates A-D) |
| 5 CI | run `43849031520` at `70d56bba3`, 4/4 per job |
| 6 Install + switch-on | install 2026-11-16T10:34:05Z; first enabled tick 10:37:20Z, 11-16 truncated, feed OFF 10:37:20Z (change list §9) |
| 9 Iterations | `896df3e30` (false replan + TasksMax; PROCEED `1571846571056701471`); `cde88cc02` free follow-up shed since 11-16 ~10:53Z, installed 11-20 00:03:59Z (PROCEED `1573123563844538452`, CI `44640384871`); the divergence check moved from the clock hour to the ON window, Part B PROCEED `1573388184308555899`, installed `f655fdd59` 11-20 18:11:36Z (change list §9b-§9e) |
| 7 First closed window | ON 18:24:20Z (the `on` path), OFF 19:46:20Z, compared 19:49:20Z: census births 2,604 + switch credits 200 = 2,804 expected; vendor webhook delta 2,776; verdict **ok**, not paged; `unpaired_windows` 0 |
| 8 Langston | **PROCEED**, Discord `1573430118146244780`: all three legs re-derived from raw objects; installed `birthcap.py` sha256 `48bc6072…` byte-identical to the repo at `f655fdd59` and at the graded ref `2b7396593` |

### PREVIOUSLY STATED / NOW

**PREVIOUSLY STATED:** the first window after the Part B install would open on the `adopt` path. **NOW:** it opened on the `on` path. **REASON:** the feed was OFF at install (OFF at 14:58:20Z), so there was no running window to adopt; the first window began at the 18:24:20Z ON switch. The adopt path has not run live.

**PREVIOUSLY STATED:** the window share is divided by the vendor's count. **NOW:** it is divided by our count, 2,804 (share 0.01). **REASON:** Langston's Step 8 correction; the code's base is the larger side, which here is ours.

## 3. Objectives

| # | objective (scope :37-:45) | status | evidence |
|---|---|---|---|
| OBJ-1 | the cap stops Helius sending: vendor counter flat across an OFF window, with an ON window the same day advancing | **MET** | 11-16: `webhooks` 837,420 and `rpc` 35,751 flat for 39 min (10:40:44Z → 11:19:21Z), file `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_OBJ1_OFF_20261116.jsonl` (this commit). 11-20 same-day pair: hours 16Z and 17Z (inside the 14:58:20Z → 18:24:20Z OFF) vendor 0, births 0 for 120 min; the 82-min ON window 18:24-19:46Z advanced 2,776. The ON leg is shorter than the OFF leg, so the control holds a fortiori. The 11-20 pair uses the webhooks counter only |
| OBJ-2 | scheduled by time; births per hour of day within the pre-registered band | **OPEN** | AMENDMENT 18 criterion, quoted in §4. Days 11-17 → 11-23; readable after 11-24 00:00Z |
| OBJ-3 | the credit cap is a backstop | **MET live** | 11-16 truncated at the first enabled tick (12,095 recorded ≥ allowance 10,493.7) |
| OBJ-4 | every switch state checked, both directions | **MET in tests; arm (i) live** | suite 142 passed, every mutant killed (change list §9e). The read-back (arm i) runs on every switch: all six 11-20 switches `ok:true` with the echo matching. Arms (ii)-(iv) and the window alarms have **never fired live**, so their silence is not evidence they work |
| OBJ-5 | everything already tracked keeps being tracked | **OPEN — criterion registered (rider 3)** | §5; window to 11-27 00:00Z |
| OBJ-6 | pre-registration amendment before the first capped birth | **MET** | `9fc98626e` (before the 10:37:20Z switch-on), rider `06df4bee5`, rider 2 |
| OBJ-7 | Kyle's purpose in `B_TOKEN_WATCH_SCOPE.md` §1 | **MET** | `b86ea91fd` |
| OBJ-8 | exact switch timestamps persisted; the log reproduces each day's on-time fraction | **OPEN — read with OBJ-2** | the log exists and every 11-20 row carries requested and responded times; the reproduction of a day's on-time fraction is computed at the OBJ-2 read |
| OBJ-9 | live before the cycle ran dry | **MET** | switch-on 11-16 10:37Z, ahead of the projected ~11-19/20 exhaustion; the cycle has not run dry (11-20 status: 2,804 census vs 2,776 vendor in the first compared window, cumulative leg clean) |

## 4. The pre-registered close criterion — OBJ-2 (AMENDMENT 18, written before the data)

> "Over the first 7 complete capped days: each hour of day's share of recorded births is compared against its coverage-weighted expected share = the reference hour-share × that hour's measured on-time fraction, renormalised …"
> "PASS: every hour's capped share is within ±1.5 percentage points, or within 30 % relative, of its coverage-weighted expected share, whichever is wider. FAIL: any hour outside both."

Reference: `Scope Files/B_TOKEN_WATCH_BIRTH_CAP_OBJ2_REFERENCE.json` (63 uncapped days, 2,423,615 rows, hour-share spread 0.49 pp). Days 11-17 → 11-23. OBJ-8 is read in the same pass: the switch log must reproduce each day's on-time fraction, and a missing entry fails the weight computation loudly.

## 5. OBJ-5 — the follow-up read (criterion registered: AMENDMENT 18 rider 3)

The scope's verification was *"follow-up counts against a pre-cap baseline window of equal length"*, with the baseline set at pre-audit :113 as *"the 7 days before switch-on"*. That window is not usable: the follow-up sweep only came back 11-15 15:12Z (`B-TOKEN-WATCH-FOLLOWUP-MEMORY` P10), and from 11-16 ~10:53Z to the `cde88cc02` install (11-20 00:03:59Z) a defect shed the free follow-up (change list §9c).

My first proposal (observed ÷ due against the 8 runs of 11-15 16:59Z → 11-16 10:52Z, PASS within 5 pp) was **sent back by Langston and is withdrawn** (`1573438420871676050`): `due` re-counts an entry every time it is requeued, so that ratio measures bucket timing rather than coverage; a 5 pp band would have passed loss the cap caused; and I had already read the post-install data, so it could not be a pre-registration.

**Registered criterion, quoted in full in `Scope Files/B_TOKEN_WATCH_PRE_REGISTRATION.md`, AMENDMENT 18 rider 3:**
- **Unit:** distinct (mint, checkpoint-age) obligations that came due in the window, each at its terminal state in the observation rows. Denominator = observed + shed + abandoned; requeued entries are on neither side.
- **Scored cohort:** mints created before the 11-16 10:37:20Z switch-on.
- **PASS:** zero cohort obligations shed for our own budget (reason `follow_up`) and zero `abandoned`. A vendor rate-limit shed (`follow_up rate-limited`) is counted and published but does not fail. No baseline comparator.
- **Window:** forward-only from the commit that landed rider 3, to 2026-11-27 00:00Z.
- **Counted from observation rows, never from the journal's `shed` total**, which also counts the liquidity leg's always-on shed (13,664 of them in the first 18 h after the install, against 0 checkpoint sheds).

**Langston's two burdens, both met in rider 3:** (a) the observation files are never pruned and reach back to 08-31; a real `follow_up` shed row from the defect window is quoted as the positive control. (b) catch-up reads the oldest buckets first and drops nothing. ⚠️ The `abandoned` leg has no positive control in the record (no `error` or `abandoned` row has ever been written), so its zero rests on the write path.

**Pre-registration-era, scoring nothing:** the full 18 h after the install is published in rider 3 (every journal key, and the row-level partition: 0 checkpoint sheds, 0 abandoned). The 8 baseline runs stay as context only.

## 6. What is unproven

- **OBJ-2 and OBJ-8** — the 7-day read (§4).
- **OBJ-5** — the read (§5, rider 3), over the window to 11-27 00:00Z. The `abandoned` leg's zero has no positive control in the record.
- **The window alarms in live use.** No `divergent`, `frozen`, `backwards`, `reset` or cumulative page has fired live. The first `reset` chance is the 11-27 cycle boundary.
- **The `adopt` path** — not taken live (§2).
- **Hour 15Z on 11-20:** 7 vendor events with 0 births just after the 14:58:20Z OFF, probably late-counted deliveries from the closing window. **NOT RE-READ.**
- **C-2, the reviewer ACL** is owed before the 11-24 read, so the reviewer can re-derive it without root. The directory-only mask instruction was disproved live on 11-24: three required objects remained unreadable while the public summary positive control was readable. The corrected installer recursively grants and verifies deploy read/traverse across `provenance`, `births`, `state`, `observations` and `study`; Coltrane review and live install are still required before adjudication (change list §9f).
- **Alert `07eba4b2`** stays open until a measured clean run.

## 7. Governance files changed (this Step 10)

CHANGE-CLASS: non_architecture

| document | class | verdict | line |
|---|---|---|---|
| the batch `SCOPE` | REQUIRED | ✅ present | r2 `ad55cb91e`, unchanged |
| the batch `PRE_AUDIT` | REQUIRED | ✅ present | r2, unchanged; OBJ-5's baseline question carried to §5 here |
| `COMPLETION_REPORT` | REQUIRED | ⏳ this PROGRESS report | converts at close; a declared-open row stands in `GOVERNANCE_EXCEPTIONS.md` |
| `BATCH_CATALOG.md` | REQUIRED | ✅ updated | new entry, marked open, in observation |
| `PHASE_HISTORY.md` | REQUIRED | ✅ updated | 2026-11-16 entry, in observation |
| `SYSTEM_MANUAL.md` | judged | N/A | a co-tenant study service, no trading architecture, strategy or maths |
| `SYSTEM_IMPACT_MAP.md` | judged | ✅ updated | token-watch section: the birthcap units, the stores, the `birthcap-*` alerts and the outbound Helius webhook writes |
| `CHANGES_AND_FIXES.md` | judged | N/A | a capability batch, not a fix; the §9 defects are inside the batch and recorded in the change list |
| `RUNNING_ISSUES.md` | judged | ✅ updated | `#1247` note: live and in observation; the entry stays open |
| `POST_AUDIT_ROADMAP.md` | judged | N/A | no roadmap item moves |
| `DELETED_COMPONENTS_LOG.md` | judged | N/A | nothing deleted |
| `ADJUSTMENT_FRAMEWORK.md` | judged | N/A | no trading knob |
| `PHASE_19_PLAN.md` | — | N/A | no row there |
| `SPRINT_TO_LIVE_PLAN.md` row 5a | REQUIRED (has a row) | ✅ updated | stale "PAUSED Step 9" → Step 10, in observation, linked here |
| `GOVERNANCE_EXCEPTIONS.md` | judged | ✅ updated | declared-open row: the batch is open past its first code-bearing push until the reads land |
| `B_TOKEN_WATCH_PRE_REGISTRATION.md` | judged | ✅ updated | AMENDMENT 18 rider 2 |
| shared `MEMORY.md` / `MEMORY_CC_INFRA.md` / Langston's `MEMORY.md` | REQUIRED | ✅ mine updated · shared N/A (no consensus truth moved) · Langston's N/A (no ruling of his to record beyond the Discord PROCEEDs) | |
| own session task list | REQUIRED | ✅ updated | row 24 |
| `CONDUCT.md` / `CLAUDE.md` | judged | N/A | no rule changed |
| `B_TOKEN_WATCH_SCOPE.md` §5.1 | judged | N/A | the parent scope's residuals are unchanged by this batch |

# B-ARCHIVE-NETWORK-RETRY — COMPLETION REPORT (CC-A / OLD Claude, 2026-11-20)

✅ **CLOSED 2026-11-20 — Langston Step 11 CONFIRMED 2026-11-20 (Discord `1573136535203614823`).** Two cells corrected at his confirm: the shared `MEMORY.md` verdict and the before → after size of his loaded set.

change-class: non_architecture · Kyle KD-97 (2026-11-16) · plan `SPRINT_TO_LIVE_PLAN.md` §0a CC-A item 3 · issue `#705` (the 2026-11-16 item)

## ⚠️ LEFT OPEN — stated first
1. **Retain-then-recover has NOT met a real refusal.** No outage was induced (it cannot be, safely). The `PERMANENT flush failure` zero after the deploy covers ~11 minutes of `error.log` and reaches neither the retry buffer, `RETRY_BUFFER_MAX` nor the shed alert (`#661` leg 3; Langston, Step 8). **The first real database refusal is where that proof appears, and nothing from 2026-11-20 may be cited for it.** If it fails, the signature is a `*-writer-shed-*` or `archive-writer-shutdown-residue` page, or `PERMANENT flush failure … ECONNREFUSED` lines in `error.log`. Owner CC-A; no plan slot (it is an event, not work).
2. **`#705` stays OPEN** for two items outside this batch: the ticker writer's splice-before-insert (`#1032`, `HOME: B-ARCHIVE-WRITER-LIFECYCLE, owner CC-B, SPRINT_TO_LIVE_PLAN row 119`) and the ~2 s shutdown late-arrival loss (an item on `#705`, owner CC-A, no new slot; Langston, Step-4 C-1 re-gate).
3. **The 60-minute `ticker:xstock_spot` hold (J3)** is a priced PROPOSAL sent to PM Claude for Kyle's list (Discord `1573132153913348188`, 2026-11-20), blocked behind `#1032`. Not a placement; this batch keeps 50,000 rows.

**Post-close organic evidence, 2026-11-26 (`#705`).** On staging exact `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, restart 716, the crypto-perp OHLC writer reported a local writer-slot timeout at 02:32:26Z. The transient path shed 80,000 input rows to leave 50,000 queued (`error.log:139544–139545`). The alert `b42cd954-3f86-4ce1-aec3-8e3b26c359fa` carries those counts and was resolved at 03:15:34Z. The same writer reported an upsert of 50,000 rows at 02:32:39Z and further successful flushes (`out.log:2787758,2793039,2795746`). This exercises the cap alert and establishes resumed writing. The logs contain counts without the exact shed keys, so they do not establish unique bars lost or completely restored. This incident exercised a writer-slot timeout. The first real database-connection refusal remains the trigger for the network-specific proof. No outage was induced and no backfill was performed. The writer-lifecycle and shutdown carries retain their existing homes.

## What the batch is for
In the 2026-11-16 staging database outage (04:20:40 → 05:20:28Z) the bar and ticker archive writers treated `connect ECONNREFUSED …:5432` as PERMANENT and discarded each batch — 3,036 failures, up to 132,466 rows, the ticker part unrecoverable. The batch makes a refused or unreachable database a retry, makes a buffer overflow loud, and measures how long each buffer can hold an outage.

## Objectives
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | the network family (`ECONNREFUSED`, `EHOSTUNREACH`, `ENETUNREACH`, `EAI_AGAIN`) is TRANSIENT; `ENOTFOUND` and every existing verdict unchanged; matched by code, never a `getaddrinfo` arm | **YES** | `isTransientWriteError` reads `code` (and `AggregateError.errors[].code`) and message arms (`7021fd944`); real-population fixtures; each new arm and the `ENOTFOUND` carve-out mutation-proved (change list Step 3) |
| OBJ-2 | a shed at the cap raises the writer:class's own alert, resolve-only | **YES** | seven `*-writer-shed-<class>` keys, `breakage` / `critical`, latch cleared by a successful flush, expiring at 6 h, released on a failed raise; plus `archive-writer-shutdown-residue` for rows held at exit (`5a56b12c1`, `3805f5f8f`, `50fbbb9d0`); unit tests with mutations (M14 killed after the fake store got a delay) |
| OBJ-3 | cover and memory measured and written down; the longer xStock hold priced for Kyle | **YES** | pre-audit (rolling hourly cover; ~609 B/ticker row, ~550 B/bar row; all eight full ≈ 221 MB); the code comment and System Impact Map §2.6b; J3 sent to PM (above) |
| OBJ-4 | the deployed process classifies a refused connection as transient | **YES**, retain-then-recover unexercised | deployed `ecbdf882e` 2026-11-20 00:03:49Z, `BUILD_SHA` = HEAD; the classifier extracted from the deployed source → 3,036/3,036 real lines TRANSIENT, four constructed controls PERMANENT; eight of eight writer:class pairs flushing within 21 s; Langston re-derived every leg (Step 8) |

## Steps
- **Step 1-2:** scope r2 (Langston approved r1 with C1-C7), pre-audit r2 approved.
- **Step 3-4:** code `7021fd944` → `50fbbb9d0`; Langston PROCEED after C-1 and two re-gates.
- **Step 5:** CI run `44640384871` 4/4 per job at `ecbdf882e` (earlier heads' runs cancelled by newer pushes, never counted).
- **Step 6:** `dt-deploy ecbdf882e… --by cc-a`, seven open windows named, combined with `B-DB-POOL-GUARD` r4 T-P1 in one restart; Langston cleared the content at `529a2aeb1` (Discord `1573119929895620760`).
- **Step 7:** change list §"Step 6 + Step 7" (`634e5e6b8`).
- **Step 8:** Langston PROCEED, Discord `1573130990572929165`, with three carries (the as-of correction, the honest size of the unexercised path, no restart 14:45-20:30Z on 2026-11-20).

## Record corrections (Langston, Step 8)
- "Every alert row created since 00:03Z is 9" was an instant; by his read it was 12 (three later registrations, none a page). A near-total on a live table carries its read time.

## New findings
None outside the batch.

## Governance ledger — Step 10
CHANGE-CLASS: non_architecture

| # | document | verdict | line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | new entry: why, what it built, verified, what is not discharged |
| T1 | `PHASE_HISTORY.md` | ✅ | 2026-11-20 entry in plain language |
| T1 | `SPRINT_TO_LIVE_PLAN.md` §0a CC-A item 3 | ✅ | status → Step 11, live sha, Step 8 ref, report link |
| T1 | `PHASE_19_PLAN.md` | N/A | no row there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ mine / REVIEWED, NO LINE ADDED shared | mine: position block. Shared: read at the ref and judged — it carries the general event-wait rule and no per-key routing (0 occurrences of `RESOLVE-ONLY`/`never ack`/`owner CC-`), a per-key line would be a new content class 32 B from its 24,576 B cap, and the routing rule lives in SIM §2.6b and `#705` (Langston, Step 11: decision upheld, cell corrected from N/A) |
| T1 | the batch `SCOPE` | ✅ | r2, Step 1 |
| T1 | the batch `PRE_AUDIT` | ✅ | r2, Step 2 |
| T1 | `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | no observation window: the unexercised path is an event (the next real refusal), not a period |
| T1 | the four session task lists | ✅ mine (item 13 added; items 1-2 refreshed) / N/A ×3 — not mine | |
| T1 | Langston's `MEMORY.md` | ✅ | one line in through `langston-memory-write`, my B-DB-SIZE-RELIEF line shortened in the same write; loaded set 143,846 → 143,796 B (−50) vs ceiling 143,856 (writer archive record 00:23:33Z) |
| T2 | `SYSTEM_MANUAL.md` | N/A | writer retry mechanics only; no strategy, signal, regime, filter or math change |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | §2.6b (network family, shed alert, routing rule, cover and memory) at Step 3, marked live; registry entry for the two alert latches and the ticker in-flight set |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#705`: the 2026-11-16 item fixed, the entry stays open for `#1032` and the late-arrival item |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-20-A |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional rule changed |
| T2 | `STORAGE_POLICY.md` | N/A | no retention or tier changed |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | not a VTS or onboarding change |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | the reviewer's build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` change |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | nothing removed |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no `MISTAKE:` trailer in this batch |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception granted |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the ack/resolve process did not change; the new keys follow it |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | the board did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | not a feature-check run |

## Honest residual
The batch establishes that the deployed code CLASSIFIES a refused connection correctly against the real outage's lines, and that the writers run normally after the restart. It does not establish that a buffer holds and replays through a real refusal, how the shed alert reads in production, or how the retry cadence behaves during a long outage (`#1082`, `B-ARCHIVE-RETRY-BACKOFF`, homed in `#1082`).

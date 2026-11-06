# B-TOKEN-WATCH-STORAGE — COMPLETION REPORT

**Batch:** `B-TOKEN-WATCH-STORAGE` · **owner:** Infra Claude (CC-INFRA) · **issue:** `#1132` (the storage half) · **plan:** `SPRINT_TO_LIVE_PLAN.md` §0a row 5b, Infra order 1 · **Kyle:** D-2, 2026-11-04 (split from the follow-up's memory fix and put ahead of it)
**change-class:** `architecture` (re-declared from `sub_batch` at Step 2, Langston condition 2)
**Scope:** `Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_STORAGE_SCOPE.md` (with amendment 1) · **pre-audit and plan:** `…/B_TOKEN_WATCH_STORAGE_PRE_AUDIT.md` r2a · **change list (every step's record):** `Claude Comms and Packages/Change Lists/B_TOKEN_WATCH_STORAGE_CHANGE_LIST.md`
**Installed on staging (not by `dt-deploy`; `token-watch/deploy/install_storage.sh` from git blobs, record `/opt/token-watch/INSTALLED`):** `41b538165` 2026-11-04 · amendment 1 `c428153655a` 2026-11-05 22:04Z · the alert-line fix `5e6f1cec8` 2026-11-06 06:34Z. **CI:** run `42117437480`, 4/4 per job, at `c428153655a`.

## ⚠️ OPEN AT CLOSE — stated first
| item | owner | home | closes when |
|---|---|---|---|
| **Store warn row `7b19347d` stays open** — the store is 6,487,518,546 B (`du -sb` as root, 2026-11-06) against the 6,442,450,944 B warn line. A standing condition, never acked. | Infra Claude | `B-TOKEN-WATCH-FOLLOWUP-MEMORY` P10 (re-enable) and P15 (the unprunable growth, decision `#1246`, Kyle via PM) | a measured store under the line; expect a re-mint until P15 lands |
| **~45 MB/day of the ~96 MB/day growth has no prune path** — `births/` is `NEVER_TOUCH` (`tier.py:57`) and `state/` has none. One 13.6-h window (11-04 16:24Z → 11-05 06:00Z); order of magnitude, not a rate. At either measured size the 8 GiB cap is 9-22 days away (Langston). | Infra Claude | P15 above | P15 decided and built |
| **`7b19347d`'s body has no "as of" line** — the C-3 fix is forward-only and the alert CLI has no body-edit verb (`scripts/system-alerts.ts:360`, `:368-384`). | — | stated, not fixable in place | the next row this key mints |
| **Uploads stopped by B2's account download cap are not reconciled** against the manifest. | Infra Claude | `#1132` 2026-11-04 note, `B-TOKEN-WATCH-FOLLOWUP-MEMORY` (version census) | the reconciler lands |

## What the batch was for
The token-watch study shares the staging box's disk with the live trading app. On 2026-11-04 its store held 13 GiB: the daily archives were compressed but never moved off the box, the size check had gone when the follow-up unit was switched off, and the follow-up's schedule files were never cleared. The batch moves the archives off the box with a verified read-back, watches the size and the feed on their own timers, pages on every unit's failure, and clears used schedule files.

## Objectives
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | the off-box leg (upload, read back by file id, manifest, then delete the local copy) | **YES** | 88 manifest lines; the 05:30Z scheduled run moved one file and skipped one under an hour old (the one-hour guard); `cold/` empty after the (v) pair |
| OBJ-2 | a least-privilege key: `listFiles`/`readFiles`/`writeFiles` on `dt-archive-cold`, prefix `token-watch/`, no delete; read only by `tokenwatch-cold` via `LoadCredential` | **YES, proof output not committed** | minted and proved by `tools/prove_cold_key.py` at the 11-04 install (delete-version and out-of-prefix read refused; hide-file allowed, recorded on `#1132`); every off-box run since authorised with it. The step-by-step proof output was not copied into the repo |
| OBJ-3 | a daily size check that pages | **YES** | over-cap row `9079f9ac` minted 11-04 16:24Z while `cold/` was undrained (predicted), resolved; warn row `7b19347d` 11-05 06:00Z; **no duplicate** — the whole alert log holds 4 token-watch rows ever, one per key (read 2026-11-06, every row, filtered by key prefix) |
| OBJ-4 | every unit's failure pages | **YES** | `cb3faf3e` (`token-watch-unit-failed-token-watch-cold-offbox.service`, 11-04 16:35Z, the same minute as the download-cap stop on `#1132`), resolved. The follow-up unit gets it in its own batch |
| OBJ-5 | the 5.7 GB backlog moves through OBJ-1's own path | **YES** | 86 backlog archives moved 11-04/05 (the first run stopped at B2's account download cap after 62; the rest on later runs); oldest, largest and newest re-downloaded by file id, sha256 and uncompressed size equal to the manifest |
| OBJ-6 | governance | **YES** | the list below |
| OBJ-7 | prune spent schedule buckets only after the follow-up has read them | **YES** | first scheduled prune 11-06 04:39Z removed 723 buckets, 1,220,540,157 B; census after it: 0 removable; the one lineage gap (`2026-09-30T13`) explained before the prune and its file preserved at `/opt/token-watch/evidence/` |
| OBJ-8 | the feed's dead-man's switch runs hourly and pages | **YES** | drill row `c525db35` minted and resolved before the timer was enabled; scheduled runs log `open_gap=None`, maxrss 15.2 MB against `MemoryMax=256M`; it recorded the two historical outages, including `#1247`'s six missing days |

## Steps and reviews
| step | result |
|---|---|
| 1 | scope; amendment 1 (2026-11-05) after Langston's sizing ruling — raising the cap and moving births off the box REFUSED, the spent-bucket prune APPROVED |
| 2 | Langston PROCEED on r2 (r2a), re-declared `architecture` |
| 3 | `f02f3cfe7`, `310132582`, `372bee3ed`; amendment 1 `eebe1ed12`, `3a68e4fd0` |
| 4 | Langston r1-r4 to PROCEED (v4 auth blocker and conditions folded, `2227755e2` → `3add04f48`); amendment 1 parts 1-3 (`55c3adfca` → `dd729465a`); Coltrane not involved |
| 5 | CI `42117437480` 4/4 at `c428153655a` |
| 6 | installed 11-04 and 11-05; the first backlog run hit B2's account download cap and the abort was made to say so (`e27301cc7` → `41b538165`); the lineage gate fired at amendment 1's install and the prune was held until it was explained (Langston PROCEED, msg `1568044465074217033`) |
| 7 | prune, census, re-download, the nothing-to-move pair, the feed watch — all PASS (`5f1016c4e`) |
| 8 | Langston CONFIRMED (msg `1568144949201993871`) with three non-blocking conditions |
| 11 | Langston CONFIRMED (msg `1568158267375484991`); OBJ-3 and OBJ-4 re-derived by him (4 rows ever; 7 of 7 units carry `OnFailure=`); two forward items on `B-TOKEN-WATCH-FOLLOWUP-MEMORY` |
| 9 | C-3: from the next row this key mints, the warn body says its figures are mint-time and how to read the live size as root (the open row `7b19347d` predates the fix and carries neither) (`5e6f1cec8`, installed 06:34Z; Langston discharged, msg `1568151343321849867`) |

## Governance files changed — the Step 10 ledger
CHANGE-CLASS: architecture

| tier | document | required/judged | verdict | one line |
|---|---|---|---|---|
| T1 | scope / pre-audit | REQUIRED | ✅ | present, amendment 1 included |
| T1 | completion report | REQUIRED | ✅ | this file |
| T1 | `BATCH_CATALOG.md` | REQUIRED | ✅ | entry added (CLOSING until Step 11) |
| T1 | `PHASE_HISTORY.md` | REQUIRED | ✅ | plain-language entry |
| T1 | `SYSTEM_MANUAL.md` | REQUIRED | ✅ | one line on the cold tier, beside the storage-policy pointer |
| T1 | `SYSTEM_IMPACT_MAP.md` | REQUIRED | ✅ | new token-watch entry at the end of Layer 9: host, users, store, caps, every unit, the off-box leg, the alert keys, the measured ACL and the shared-disk blast radius (a gap since the parent batch) |
| T1 | `SPRINT_TO_LIVE_PLAN.md` row 5b | REQUIRED | ✅ | closing, report linked |
| T1 | `PHASE_19_PLAN.md` | REQUIRED if P19 | N/A | not a `P19-*` batch, no row there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | REQUIRED | ✅ / N/A | mine at each step; shared: nothing every session must know |
| T1 | Langston's `MEMORY.md` | REQUIRED | ✅ | one STANDING NOTES line through `langston-memory-write` (part `e6360704` → `8988f8bf`): `7b19347d` is a standing condition, its body frozen at mint (7.18 GiB), read the live size as root, never ack, owner the follow-up batch; loaded set 142,797 / 143,856 B |
| T1 | session task list (mine) | REQUIRED | ✅ | row → Step 11; CC_A / CC_B / CC_C: N/A — not mine |
| T1 | Observation column | judged | N/A | the open warn row is a standing condition owned by the follow-up batch, not an observation window |
| T2 | `RUNNING_ISSUES.md` | judged | ✅ | `#1132` annotated: the storage half closes, the rest stays open |
| T2 | `CHANGES_AND_FIXES.md` | judged | ✅ | FIX-2026-11-06-C |
| T2 | `STORAGE_POLICY.md` | judged | ✅ | new §7.6: the hot, on-box cold and off-box cold tiers, the caps, move-never-drop |
| T2 | the B-TOKEN-WATCH pre-registration | judged (scope OBJ-6) | ✅ | AMENDMENT 16: raw payload now off-box, what the criteria read untouched, the birth gap `#1247` |
| T2 | `token-watch/README.md` | judged (scope OBJ-6) | ✅ | already updated at Step 3 (the storage pieces and how to read an archive back) |
| T2 | `POST_AUDIT_ROADMAP.md` | judged | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | judged | N/A | no trading tunable |
| T2 | `AUTHORITY_BASELINE.md` | judged | N/A | no constitutional change |
| T2 | `DELETED_COMPONENTS_LOG.md` | judged | N/A | nothing deleted (spent schedule buckets are data cleared by design, recorded in the change list) |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` / `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | judged | N/A | not that work |
| T2 | `LANGSTON_ARCHITECTURE.md` | judged | N/A | his build did not change |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | judged | N/A | the method did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` / rule history | judged | N/A | no stable rule changed |
| T2 | `MISTAKE_PATTERNS.md` | judged | N/A | trailers in `44a755bca` (shared-tmp-redirect) and `5cf78695f`; the weekly pass harvests them |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | judged | N/A | closes on this report; no exception |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | judged | N/A | the alert process did not change |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | judged | N/A | the card moved; the board did not change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | judged | N/A | not run here |

## Findings and lessons
- **A check that compares refs is not a backup check; a read-back by file id is** — every archive is downloaded back and hashed before its local copy goes.
- **A standing condition is routed, never acked** — an ack hides it from the per-turn read and still blocks the key's next mint.
- **A gate that fires is a lead, not a stop sign to route around:** the lineage gap was explained from the code (`follow_up.py:308-311` requeues unread entries to the next bucket) before the prune ran, and the flagged file was kept.

## Honest residual
- **RULED ON REPORTED FACT by Langston** (he cannot read `due/`, `provenance/` or the journals as his account): the 04:39Z prune, the census, the (ii) re-downloads, the (v) pair, the feed-watch maxrss, the store sizes, and the lineage leg's 9,105 copies.
- OBJ-2's proof output is not in the repo (above).
- After the prune the lineage gate reads clean because the flagged object is gone, not because its premise was proven (Langston C-2).

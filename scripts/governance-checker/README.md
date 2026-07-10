# B-GOV governance-checker

Post-batch governance enforcement: a **deterministic bot for the mechanical facts** + **Langston for the judgment calls**. It DETECTS a governance gap, names it exactly, and keeps it flagged in the §10.5 alert queue (read every turn) until the fix actually lands. It does **not** physically block a push — that honest ceiling is by design (no airtight block without a side branch, which Kyle ruled out). Design: `Claude Comms and Packages/Scope Files/BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` + `BATCH_B_GOV_PRE_AUDIT.md`.


## 📍 WHERE IT RUNS — read this before measuring anything about the checker (added 2026-07-10, #492)

**The checker runs from its OWN clone, on the STAGING box. Not Helsinki. Not the deploy clone.**

```
host      : staging, 188.245.193.8
clone     : /opt/governance-checker/DawnTraderV3        (owner deploy:deploy, mode 775 — readable as `deploy`)
unit      : governance-checker.timer -> governance-checker.service
            WorkingDirectory=/opt/governance-checker/DawnTraderV3
            ExecStart=/usr/bin/node scripts/governance-checker/poller.mjs
NOT here  : /home/deploy/dawntrader   <- the APPLICATION deploy clone. Different repo, different HEAD.
NOT here  : Helsinki 204.168.141.77   <- no clone, no governance units.
```

**Why this block exists.** On 2026-07-10 nobody could find where the checker lived. Langston searched Helsinki (wrong box), found nothing, and reported he could not reach it. The crew *confirmed his blindness instead of testing it*, wrote it into two issues and a report to Kyle, and nearly filed a permissions defect that did not exist. **He could read it the whole time.** The entire failure was that its host appeared in exactly one parenthetical in the whole governance record. (`RUNNING_ISSUES.md` #492, #455.)

**Grade the checker by TREE HASH, never by commit count** (#449 addendum-5). Both halves run from anywhere:
```
git rev-parse <deployed-sha>:scripts/governance-checker
git rev-parse origin/migration/aws-supabase:scripts/governance-checker
```
Identical hashes ⇒ the enforcer's code is current. A commit count measures doc churn on a live branch and says nothing about the enforcer.

**⚠️ NOTHING DEPLOYS TO THIS CLONE.** No `ExecStartPre`, no cron pull, no git in the unit. The last update was a human, by hand, on 2026-06-26. **Any fix merged to origin will NOT run until someone deploys it** (#449 addendum-6).

## ✅ ACTIVATION STATE — LIVE (corrected 2026-07-10)
**⚠️ THIS SECTION USED TO SAY THE CHECKER WAS INERT. IT HAS BEEN RUNNING LIVE SINCE 2026-06-24** (`governance-checker.timer`, 30-minute period; `GOV_SHADOW=0`). The stale claim below is preserved, struck, because a README asserting the opposite of what the code does is the exact defect this system exists to catch — and it sat in the checker's own front door for two weeks. **Original text follows.**

~~This batch ships the checker but does NOT yet run it live.~~ The detection core + decision logic are built and tested; the live poller is INERT until it is deployed to a local clone on the box with the systemd timer installed AND Langston has done the Step-4 code review. Until then it only runs on demand (the backtest).

### B-GOV-2 — HARD pre-activation gate (must land BEFORE the timer is flipped on; Langston Step-4)
These cannot be open-ended deferrals — without them, flipping the timer on misbehaves:
1. **Change-class declaration + Obj-12 path-heuristic.** `computeBatchStates` never sets `declaredClass`, so every batch falls to `DEFAULT_CLASS = architecture`, which requires `system_manual` + `sim` on everything → false doc-gap REDs on every sub-batch/non-arch close. Class must be declared (scope-header) + a path-heuristic under-declaration guard, before live.
2. **Dead-man heartbeat.** `HEARTBEAT_MISS_LIMIT` is defined but unused; `Persistent=true` only gives boot catch-up, not silence-detection. A silently-dead checker = zero enforcement with nobody told (the §18 failure mode). Wire silence-detection before live.
(C1 DELETED_COMPONENTS_LOG stays a safe deferral — already conditional, can never RED-alarm.)

## Pieces
| File | Role | Tested |
|---|---|---|
| `config.mjs` | single source of truth: batch/phase naming + parser, code/governance path classes, doc registry, per-class expected-doc-set, deadline (4h), tick (30m), floors | via backtest + poller tests |
| `checker.mjs` | deterministic mechanical core: git log, commit classification, doc presence (file-glob + entry), emptiness/hollow detection, pre-audit structural check (cites SIM/Manual + file:line) | backtest (real history) |
| `poller.mjs` | live watcher: pure decision logic (`computeBatchStates`, `decideAlerts`) + side-effect wrappers (git fetch, alert sink via the staging `system-alerts` CLI, state IO, exceptions ledger read) | `poller.test.mjs` (23 cases) |
| `backtest.mjs` | **Obj-11 GATE**: replays the detector over real history; must pass clean closes + flag B3b's missing pre-audit + flag a hollow doc | self |
| `poller.test.mjs` | pure decision-logic unit tests (no git/ssh/fs) | self |
| `governance-checker.{service,timer}` | systemd oneshot + 30-min timer (own process, isolated, local clone only) | — |

## Run locally
```
node scripts/governance-checker/backtest.mjs      # Obj-11 gate — must print "GATE: PASS"
node scripts/governance-checker/poller.test.mjs   # decision-logic tests
```

## Two alert types (kept distinct — C8)
- **deadline** (`gov-deadline:<batch>`): code pushed, no governance push within 4h. Clears on the FIRST governance push.
- **doc-gap** (`gov-docgap:<batch>:<doc>`): a required doc is absent/hollow after close. Persists until the doc lands (resolve-on-verified-state, Obj-13) or a confirmed N/A in `GOVERNANCE_EXCEPTIONS.md`.
Plus **stale-open** (`gov-staleopen:<batch>`, C3) and an untagged-code-push low-sev flag (C4).

## Honest ceiling
Rock-solid/deterministic: required-doc presence, emptiness, pre-audit filed + cites SIM/Manual + has file:line markers, the 4h deadline. Judgment (routed to Langston): is a present doc thorough enough, is a skip legitimate. Self-declared inputs (batch-id, change-class, open-state, umbrella-namespace) all fail-closed to the strict default and are audited in `GOVERNANCE_EXCEPTIONS.md`.

## Deploy (after Langston Step-4) — NOT YET DONE
1. Local clone to `/opt/governance-checker/DawnTraderV3` (plain disk, NOT gdrive — C6).
2. `mkdir -p /var/lib/governance-checker` (state dir, outside the repo).
3. No CLI change needed: the poller calls the existing `system-alerts add` (parses the printed alert `.id`) and `resolve <id> --by`; it dedupes via its own state file (logical-key → alert-id), and carries the logical key in `--metadata` for forensics.
4. Install the unit + timer; `systemctl enable --now governance-checker.timer`.
5. Confirm a tick runs clean and the heartbeat lands in `state.json`.

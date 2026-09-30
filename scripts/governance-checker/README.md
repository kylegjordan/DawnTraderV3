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

**Grade the checker by the POLLER'S MODULE-CLOSURE hashes — never by commit count, and never by the directory tree** (#449 addendum-5, corrected by addendum-7). Runs from anywhere:
```
# the checker's REAL closure = poller.mjs DRIFT_LOADED_FILES (the same list the live drift canary grades):
#   poller.mjs imports ./config.mjs, ./checker.mjs and ./census.mjs; heartbeat-check.mjs is its own process
for f in poller.mjs checker.mjs config.mjs heartbeat-check.mjs census.mjs; do
  git rev-parse "<deployed-sha>:scripts/governance-checker/$f"
  git rev-parse "origin/migration/aws-supabase:scripts/governance-checker/$f"
done
```
Five blob pairs, each identical ⇒ the enforcer is running current logic. (`heartbeat-check.mjs` is a **separate process** with its own unit, but it runs from the same clone and is in the same list since P29 — so the canary grades it too.)

**Why not the directory tree?** Because *this very README is inside it.* The block you are reading changed `scripts/governance-checker`'s tree hash within an hour of that hash being adopted as the invariant — while every executable stayed byte-identical. **A directory is not a program.** A commit count measures doc churn on a live branch; a directory hash measures doc churn too, just less obviously.

**⚠️ THIS CLONE DEPLOYS ITSELF** (corrected by `B-PLAN-CURRENCY-CHECK` P48, 2026-09-30, read on the box): the box-only drop-in `governance-checker.service.d/20-auto-redeploy.conf` runs a non-fatal `git fetch` + `git merge --ff-only origin/migration/aws-supabase` before every tick, so **PUSHING CHECKER CODE DEPLOYS IT within ~30 minutes, outside `dt-deploy` and the app deploy hold.** The heartbeat runs from the same clone. The repo unit differs from what runs (`go-live.conf` sets `GOV_SHADOW=0` and `GOV_CUTOFF`) — `#1004`. *(This line read "NOTHING DEPLOYS TO THIS CLONE … last update by hand 2026-06-26" from #449 addendum-6 until the auto-redeploy drop-in landed on 2026-07-11.)*

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
| `checker.mjs` | deterministic mechanical core: git log, commit classification, doc presence (file-glob + entry); also emptiness/hollow and pre-audit-structure helpers (cites SIM/Manual + file:line), used by `backtest.mjs` ONLY, not by the live poller | backtest (real history) |
| `poller.mjs` | live watcher: pure decision logic (`computeBatchStates`, `decideAlerts`) + side-effect wrappers (git fetch, alert sink via the staging `system-alerts` CLI, state IO, exceptions ledger read) | `poller.test.mjs` (CI step *Governance checker tests (poller)*) |
| `backtest.mjs` | **Obj-11 GATE**: replays the detector over real history; must pass clean closes + flag B3b's missing pre-audit + flag a hollow doc | self |
| `poller.test.mjs` | pure decision-logic unit tests (no git/ssh/fs) | self |
| `heartbeat-check.mjs` | the dead-man heartbeat — a SEPARATE process with its own unit: pure `decideHeartbeat` (poller silence + the census and mistake-pass liveness legs) and an IO shell | `heartbeat-check.test.mjs` (CI) |
| `heartbeat-check.test.mjs` | the heartbeat's unit tests, including the parent-outcome differential table | self (CI, Test Suite) |
| `heartbeat-differential.mjs` | **hand-run, not CI** (needs git, bash and npm): runs a chosen version's real `checkHeartbeat` once per state against temp files and a fake alert CLI, so a refactor of the heartbeat can be compared against its parent | self |
| `census.mjs` | the weekly plan census and the weekly mistake pass (P43-P46): pure rules over the plan, the ledger and the after-live list, plus their git readers; imported by the poller, flags `WEEKLY_CENSUS_ENABLED` / `MISTAKE_PASS_ENABLED` | `census.test.mjs` (CI step *Governance checker tests (census)*) |
| `census.test.mjs` | the census rules on pinned fixture text, plus one live-git leg for the plan-history parent read | self (CI) |
| `exceptions-preview.mjs` · `ledger-rows-preview.mjs` · `plan-lines-preview.mjs` | **hand-run previews**: print what the exceptions grammar, the Tier-1 ledger-row check and the plan-line check would read at a ref, without minting anything | — |
| `fixtures/` | pinned inputs for the tests (e.g. the exceptions ledger at `a3097dc6a`, the equivalence pin) | — |
| `governance-checker.{service,timer}` | systemd oneshot + 30-min timer (own process, isolated, local clone only) | — |
| `governance-checker-heartbeat.{service,timer}` · `governance-checker-heartbeat-failed-notify.service` | the heartbeat's own unit + timer, and the `OnFailure=` notifier that says when the heartbeat itself dies | — |

## Run locally
```
node scripts/governance-checker/backtest.mjs      # Obj-11 gate — must print "GATE: PASS"
node scripts/governance-checker/poller.test.mjs   # decision-logic tests
```

## Two alert types (kept distinct — C8)
- **deadline** (`gov-deadline:<batch>`): code pushed, no governance push within 4h. Clears on the FIRST governance push.
- **doc-gap** (`gov-docgap:<batch>:<doc>`): a required doc is absent after close (presence only; hollowness is not graded live). Persists until the doc lands (resolve-on-verified-state, Obj-13) or a confirmed N/A in `GOVERNANCE_EXCEPTIONS.md`.
- **ledger-row** (`gov-ledgerrow:<batch>:<row>`, B-TASK-LIST-SLOT `#1009`): the batch's completion report has no Tier-1 ledger TABLE ROW for `<row>` — a table line whose FIRST cell is the `T1` tier marker and which names the row, outside a code fence, whose first verdict is not ❌ and with a verdict segment beginning ✅ (`✅ mine / N/A ×3` passes) (today one row: the session task lists — `LEDGER_ROWS` in `config.mjs`). Graded only once the completion report exists, every class, and only for batches whose EARLIEST matched completion report was first added after that row's `sinceMs`. Resolves when the row lands or on a confirmed N/A (`na-skip` value = the row name); an aged-out alert is re-verified by the orphan sweep, never blind-resolved. Offline preview before a deploy: `GOV_CUTOFF=<box value> node scripts/governance-checker/ledger-rows-preview.mjs`.
Plus **stale-open** (`gov-staleopen:<batch>`, C3) and an untagged-code-push low-sev flag (C4).

## Honest ceiling
Rock-solid/deterministic (live): required-doc presence and the 4h deadline. Emptiness and pre-audit structure (filed, cites SIM/Manual, has file:line markers) are checked only in the backtest. Judgment (routed to Langston): is a present doc thorough enough, is a skip legitimate. Self-declared inputs (batch-id, change-class, open-state, umbrella-namespace) all fail-closed to the strict default and are audited in `GOVERNANCE_EXCEPTIONS.md`.

## Deploy (done 2026-06-24; self-updating since 2026-07-11)
Clone at `/opt/governance-checker/DawnTraderV3` (plain disk, NOT gdrive — C6); state in `/var/lib/governance-checker`; unit + 30-min timer enabled 2026-06-24 (`go-live.conf`: `GOV_SHADOW=0`); the auto-redeploy drop-in landed 2026-07-11 (B-GOV-INTEGRITY-0), so every tick fast-forwards the clone first. Alerts go through the existing `system-alerts add` / `resolve --by governance-checker --evidence <ref>` (`--evidence` mandatory since B-GOV-INTEGRITY-1; `governance-checker` is an allowlisted actor since #987). *(The original five-step "NOT YET DONE" checklist is in git history; every step is done.)*

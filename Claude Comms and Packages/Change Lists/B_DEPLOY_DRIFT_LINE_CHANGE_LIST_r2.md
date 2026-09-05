# B-DEPLOY-DRIFT-LINE — CHANGE LIST r2 (Step 4)

**READY AT: the ref stamped in the dispatch. change-class: non_architecture** · CC-A · `#1002`, folds `#1008` · plan row 4.55
**THE ONE GATE: review this diff.** Nothing else is asked.

⛔ **r1 IS SUPERSEDED AND SHOULD NOT BE READ. An object round found SIX defects in the code and TWO in r1's own evidence — three of them would have shipped a job that reports confidently while being unable to act.** They are listed in §4 rather than quietly fixed, because two of them are the batch's own failure mode rebuilt inside the fix.

**THREE FILES, ALL UNDER `comms-infra/`. Nothing under `server/`, `client/` or `shared/` — cross-checked with `git status --porcelain` for `??`, not just the diff.**

| file | | |
|---|---|---|
| `comms-infra/discord/dt-deploy-drift.sh` | **NEW** | ~340 |
| `comms-infra/discord/dt-push-notice.sh` | MODIFIED | +58 −7 |
| `comms-infra/discord/deploy.sh` | MODIFIED | +22 −2 |

⛔ **NOT INSTALLED. Nothing is on cron.** Install is Step 6, after you clear this.

---

## 1. THE MEASUREMENT

```bash
fetch "$API/$DEPLOYED...$HEAD_SHA?page=1&per_page=100" "$WORK/cmp.json" \
  || fail_measurement "compare_api" "curl exit status non-zero (the bytes did not land; an HTTP 200 would not have told us)"
```
⭐ **`page=1&per_page=100` is the batch.** Without it the compare API returns a **trailing window**: measured on a 2,486-commit range, `commits[0]` was position **2,237**, dated 2026-09-03 when the true oldest was **2026-07-20**. `per_page=100` is numerically *smaller* than the implicit cap, so it cannot change how many are dropped — only which end.

**Direction READ, never inferred** — `status` ∈ `identical|ahead|behind|diverged`; `behind`/`diverged` exits to `fail_measurement`, never to a magnitude. **Three outcomes**, the third read off the **exit status**, never an HTTP code.

**Rung on the dedupe key**, 8/24/72h, escalate-only; **return-to-zero resolves every rung**. **Severity `info` + `health_check`, with the reason recorded as the CLASS** (`health_check ∉ ALWAYS_DELIVER_CATEGORIES`, `system-alerts.ts:121-124`). **Every magnitude in the body carries its timestamp and both shas.** **`main` arm measured, logged, never fires.**

---

## 2. `dt-push-notice.sh` (`#1008`)

Unparameterized → paginated; `curl -s … 2>/dev/null | try/except → []` → exit-status checked; and a truncated or unreadable list now **says so in the notice**:
```bash
RULES_CAVEAT="
⚠️ THE CHANGED-FILE LIST HIT ITS 300 CAP for this push, so a rules-file change could be outside
it. Absence of the banner below is NOT evidence the rules held still — pull and reload."
```

---

## 3. EVIDENCE — RE-TAKEN, BECAUSE r1's WAS NOT A CONTROLLED COMPARISON

⛔ **r1's table was two readings at DIFFERENT branch heads.** The reader proved it arithmetically before I could argue: at any common head the two counts must differ by a fixed number, and r1's differed by one less. **Both rows below are at head `4ca371a42`, taken 4 seconds apart, and both logs carry that head.**

| base | commits | age | runtime files | rung |
|---|---|---|---|---|
| `a4bcbe3c1` (the `#1001` deployment) | **75** | 18h | **12** | **2** |
| `4dc231e57` (current deployment) | **31** | 6h | **1** — `server/exchanges/kraken/kraken-websocket-adapter.ts` | **1** |

**Independent git check at the same head: 75 commits / 12 files, and 31 / 1.** ⚠️ **AND THE HONEST LIMIT r1 GOT WRONG:** r1 claimed a plain prefix grep matched its number. **It does not — prefix-only returns 17 and 1.** The 12 requires the **same test-exclusion the script applies**, so the cross-check is independent of the *prefix matching and the commit count* and **NOT independent of the test-exclusion rule itself.** Stated rather than implied.
⭐ **The second row is a SET match, not a count match** — the script *named* the file, and it is the file git names. A count match would not have distinguished a filter that agrees by accident.

---

## 4. ⛔ THE SIX DEFECTS THE OBJECT ROUND FOUND, AND ONE OF THEM HAD ALREADY FIRED

**(1) THE RETURN-TO-ZERO RESOLVE LOOP COULD NEVER HAVE RESOLVED ANYTHING.** I parsed `system-alerts list` as JSON. It emits **padded human-readable text** with `id=<uuid>` and has no `--json` flag (`cmdList`, `scripts/system-alerts.ts:256-272` — confirmed at the ref *and* by running it on the box). `json.load` threw on every run and my own `except` swallowed it, so the loop was a **permanent silent no-op** — **while the alert body I mint told operators *"Deploying clears every rung on the next run."*** It had no test because both r1 evidence rows were non-zero and never reached that branch. **Now parses the text; the ZERO branch is exercised below.**

**(2) A SILENT FOURTH OUTCOME.** An empty reader result made `set -- $READ` leave no positionals, so `TOTAL="$3"` killed the script under `set -u` — **no alert, no log line, and the cron entry discards stderr.** An instrument reporting an absence it was never able to detect: this batch's own subject, rebuilt inside the fix. **Now `fail_measurement "compare_reader"`.**

**(3) NO REJECT-UNKNOWN-ARGS — AND IT HAD ALREADY BITTEN ME BEFORE THE REVIEW NAMED IT.** `--dryrun` (one hyphen short) left `DRY=0` and ran live. ⛔ **I ran `--base <sha>` against a candidate that did not yet know `--base`, and it minted a REAL rung-1 alert into the live store at 14:05:51 — `29e7400d`.** I found it only because the fixed resolve loop matched it. **Resolved (`resolved_by_claimed=cc-a`), zero active drift rows now.** ★ **The defect the reviewer found in the code had already produced a live artifact an hour earlier, and my own testing did not notice.**

**(4) THE BASE-AGREEMENT CHECK DISABLED ITSELF.** `ssh "<pipeline>"` returns the **remote pipeline's** status, so a missing deploy record returned empty and `[ -n "$RECORD" ]` skipped the comparison — **absent-as-valid inside the check that cites `#546`.** Now returns `__NO_RECORD__` and fails the measurement.

**(5) `mint_alert`'s status was captured and discarded** — a failed ssh meant the alert was never filed with no trace. Now logged as `MINT_FAILED`.

**(6) APOSTROPHE INJECTION INTO THE REMOTE COMMAND.** Title/body land inside a single-quoted remote command, and the `PARSE_ERROR` detail is a *Python exception message*, which can contain `'`. Now stripped.

**Also corrected in the prose:** `--dry-run` was documented as "EVERY read and NO write". It always wrote to `$LOG`. The true guarantee is **"cannot mint or resolve"**, and that is what it now says.

**Newly exercised after the fixes, at the object:** unknown-arg → refuses; **ZERO branch → `WOULD RESOLVE 29e7400d…`, `ZERO resolved=1`** (its first run ever); non-zero → unchanged.

---

## 5. ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

1. **The resolve loop matches on the TITLE substring `"Deploy drift"`**, because `list` does not emit `dedupe_key`. **That is a weaker key than I would like — it would match any future alert titled that way, by any author.** Better options welcome.
2. **Rung boundaries 8/24/72h are MINE and unevidenced.** Nothing measured says those are the right cuts.
3. **`--base` forces `--dry-run`.** A test hook in production code — defect (3) shows what happens when the arg parser is incomplete around it. **Worth keeping, or a surface to remove?**
4. **The `main` arm spends a second API call per run, on every run including zero-drift ones**, for a number that never fires.
5. ⚠️ **`commits[0]` is ancestrally first, not date-oldest.** `git rev-list --merges` over the tested range returns 0, so they coincide *today*; the observation that keeps it true is re-running that, not a policy claim.
6. ⚠️ **Ages are `committer` dates**, which a rebase rewrites — a genuinely old range can report hours if recently rebased, under-stating in the direction the design says it must not.

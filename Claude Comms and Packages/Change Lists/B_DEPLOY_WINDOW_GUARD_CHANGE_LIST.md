# B-DEPLOY-WINDOW-GUARD — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) declared change-class** | `non_architecture` (scope header) |
| **(ii) doc set for that class** | SCOPE — present, `Scope Files/B_DEPLOY_WINDOW_GUARD_SCOPE.md` · PRE_AUDIT — present, `Scope Files/B_DEPLOY_WINDOW_GUARD_PRE_AUDIT.md` (r3 + Part E) · COMPLETION_REPORT — absent, owed at Step 11 · BATCH_CATALOG, PHASE_HISTORY — absent, owed at Step 10 · SYSTEM_MANUAL, SYSTEM_IMPACT_MAP — judged at Step 10 (SIM `#649` and row `:1366` are applicable; System Manual only the usage line `:13448`) · `SPRINT_TO_LIVE_PLAN.md` row 10a — present, updated each step |
| **(iii) Step-2 reference** | `Scope Files/B_DEPLOY_WINDOW_GUARD_PRE_AUDIT.md` at the ref — Step 2 PROCEED (msg `1570874939672764589`), C-12 to C-17 settled in its Part D |

**Commits:** `033d7f6da` (1/3: register, parser, dt-deploy) · `be9ca2128` (2/3: dt-install-drift) · `dd7e4c6f1` (3/3: watcher, sandbox, skills, Part E). Nothing is installed. **Held, not pushed:** the one-line machine actor in `server/services/system-alerts.ts` (shown at the end). It is runtime code, and tonight's joint deploy would otherwise carry it before you have read it.

## GATE A — the deploy path: `scripts/dt-deploy.sh`, `scripts/obs-windows.py`, their tests

**`scripts/dt-deploy.sh`** (98 lines added, 3 removed against `700ea99b5`):
- `:49-58`, a marked CONSTANTS block (paths, branch, `REGISTER_PATH`, `OBS_WINDOWS=/usr/local/bin/dt-obs-windows`, `NOTICE=/home/deploy/dawntrader-deploy.notice`). It is the only part the sandbox swaps.
- `--in-window`, with the four existing refusal arms: missing value, flag-looking value, duplicate, and `--in-window=` (refused by the shared `=` arm).
- **The register check, right after the sha-on-branch check** (C-1, C-2):
```bash
REGISTER_SHA=$(git rev-parse "$BRANCH")
REGISTER_BLOB=$(git rev-parse --verify --quiet "$BRANCH:$REGISTER_PATH" || echo absent)
[ -x "$OBS_WINDOWS" ] || win_refuse 4 "... is not installed ..."
[ "$REGISTER_BLOB" != absent ] || win_refuse 4 "... does not exist at $BRANCH ..."
REGISTER_TEXT=$(git show "$BRANCH:$REGISTER_PATH") || win_refuse 4 "... could not be read."
set +e; WIN_OUT=$(printf '%s\n' "$REGISTER_TEXT" | "$OBS_WINDOWS" "${WIN_ARGS[@]}"); WIN_RC=$?; set -e
case "$WIN_RC" in 0) ;; 4) win_refuse 4 ...;; 5) win_refuse 5 ...;; *) win_refuse 4 ...;; esac
IN_WINDOW=$(... grep -E '^IN_WINDOW ' | cut -d' ' -f2 || true)   # || true: pipefail would trip set -e first
[ -n "$IN_WINDOW" ] || win_refuse 4 "... printed no IN_WINDOW line ..."
```
`win_refuse` prints `register_sha= register_blob= in_window=` on every refusal. Holds (C-4) print `becomes LIVE` / `stays NOT live` from `git merge-base --is-ancestor <landing_sha> "$SHA"`. They never refuse.
- **The notice and the alert, after the dirty-tree check, immediately before `DEPLOYED_SHA=` and `git reset --hard`** (C-12, C-13; reordered at r2 per C-18). **First** `{ : >> "$NOTICE"; } || win_refuse 6` secures the fail-closed leg, so the exit-6 path mints nothing. Then for each window landed in (open or stale): a best-effort `timeout -k 10 "$MINT_TIMEOUT_S" npm run -s system-alerts -- add ... --category governance --severity warning --dedupe-key deploy-in-window:$WB:$SHA:$ATTEMPT_KEY` (C-21; `MINT_TIMEOUT_S=60` in the CONSTANTS block). Its failure or timeout sets `WINDOW_NOTICE=notice-only` and prints `IN-WINDOW ALERT NOT RAISED`. Then:
```bash
printf 'attempt_at=%s attempt_key=%s sha=%s by=%s in_window=%s window_notice=%s register_sha=%s\n' ... >> "$NOTICE" \
  || win_refuse 6 "... although it was writable a moment ago. No deploy step ran, but the alert(s) above may exist ..."
```
- The record gains `register_sha=`, `register_blob=`, `in_window=`, `window_notice=` (12 lines). Every reader picks fields by name (pre-audit A-4).

**`scripts/obs-windows.py`** (new; installed as `/usr/local/bin/dt-obs-windows`): header required; append-only `open | amend | close | hold | release`; unknown keys refused; every window has `review_by`; stale = past `review_by`, `end` or `expected_by`, never blocking; `check` exits 0/4/5; a caller-typed name is never echoed. `OWNERS` is fenced to the derived deploy set and `DEPLOY_ACTOR_LIST` by `server/tests/unit/dt-deploy-actor-parity.test.ts` (12/12).

**Evidence, each with its command** (all re-runnable at the ref):
- `python3 scripts/test-obs-windows.py`: 52 cases, 0 failures. `--mutate`: 15 of 15 refusals removed one at a time, all killed (judged by exit code; my first run had one survivor, fixed with a case where `review_by` passes before `end`).
- `python3 scripts/test-dt-deploy-windows.py [--dt-deploy <path>] [--expect-sha256 <hex>]` (Linux; `TMPDIR` off shared /tmp): **25 of 25 at r3** (r1 was 18/18). Cases (a) absent, (b) malformed, (c) one open unnamed, (d) two open with one named, (e) **worktree copy has no window, HEAD has one ⇒ refused** (C-1); the `=` form; no windows + dirty tree ⇒ exit 3 with no notice; named window + dirty tree ⇒ exit 3, **no notice** (C-13); mint fails ⇒ `notice-only` and the deploy proceeds (C-12); mint succeeds ⇒ `alerted` with the per-attempt key; notice unwritable ⇒ **exit 6, HEAD unchanged, lock released, npm.log empty** (C-18); stale window ⇒ not blocking, `STALE WINDOW`, noticed; **an open window whose text says "stale" prints no `STALE WINDOW`** (C-19); **three holds: in the deploy ⇒ LIVE, side branch ⇒ NOT live, ghost sha ⇒ CANNOT BE DETERMINED** (C-20); **a mint that hangs 30 s is cut off at the 1 s test timeout ⇒ notice-only, run under 25 s** (C-21); parser absent ⇒ exit 4.
- **Mutants of `dt-deploy.sh` run through that sandbox, all killed (r3):** register read from the worktree · notice not secured before the mint (C-18) · bare `' stale '` (C-19) · ghost arm removed (C-20) · no timeout (C-21) · fail-closed mint (C-12) · `--in-window` ignored. Langston re-ran three of his own at r2 (C-18, C-19, C-20); all bit.

**Gate A CLEARED (Langston, r2, msg `1570893221679210630`).** His rulings on the three questions below: (1) stale keeps its notice and wake; (2) minting in the old tree with notice-only fallback is right, given C-18 and C-21; (3) no rotation cap; the watcher joins on the `attempt_key` FIELD (done). **Named limit, for the completion report:** on the SECOND exit 6 (the append fails after the mints, i.e. a full disk) the alerts exist with no notice line, so neither the watcher nor the daily check sees them, and their body's promise that the watcher resolves them is false on that one path. Only the deployer reading the refusal closes them. The questions as asked:
1. **`IN_WINDOW` lists every not-closed window, open and stale.** So a deploy into a stale window still writes a notice and wakes its owner. Is that the intent of your J3(ii), or should stale windows only alert?
2. **The alert runs `npm run system-alerts` in the OLD tree** (before the reset). A tree whose `system-alerts.ts` predates `--dedupe-key` would fail the mint and degrade to `notice-only`. Today's deployed tree has it. Is degrading to `notice-only` the right failure here?
3. **The notice file has no rotation.** One line per in-window attempt, so it grows slowly. The watcher reads the whole file over SSH every 2 min. Is this acceptable as stated, or does it need a cap now?

## GATE B — dispatched separately, after A: `dt-install-drift` and the Helsinki watcher
`comms-infra/staging/dt-install-drift` (staging manifest + per-file 1-day grace + the `deploy_windows` check off the verdict; Helsinki manifest gains the watcher) and `comms-infra/discord/dt-deploy-notice.py` + units. Evidence: drift suite 58/58 and mutations 40/40 (5 new) on Helsinki; watcher suite 22/22, mutations 8/8, every post parsed back through `address_list.opening_addressees`.

## Part E — a reversal to put in front of you, not bury
**C-7's answer was wrong.** A-14 said `daily_deploy_check.sh` had no live reference, but that searched the repo, never the alert store. **A self-chained weekly alert runs it by hand.** The next run is `7164d7ab`, due 2026-11-18T07:00Z; the last runs were resolved by cc-b and codex-b. **It is KEPT, disposition (1)**, with only its display fix. The install will happen right after a deploy whose sha carries the new `dt-deploy.sh`, so its check (3) reads MATCH.

## Held line (not pushed): `server/services/system-alerts.ts`
```ts
  { value: 'deploy-notice-watcher', tag: 'machine', why: 'comms-infra/discord/dt-deploy-notice.py (2-min timer on Helsinki): posts the start and the outcome ... then resolves the deploy-in-window:<batch>:<sha>:<attempt> alert dt-deploy raised, citing the record and the post ids. Also arms and resolves its own daily heartbeat. B-DEPLOY-WINDOW-GUARD #1249 (Langston C-14).' },
```
Actor-allowlist suite with it: 35/35.

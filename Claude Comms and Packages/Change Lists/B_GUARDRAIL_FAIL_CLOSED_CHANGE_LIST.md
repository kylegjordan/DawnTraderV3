# B-GUARDRAIL-FAIL-CLOSED (`#1081`, row `4.a`) — STEP 4 CHANGE LIST

**Graded ref:** `551e13bc1` (code). **CI:** run `36499306646` on `ce44019e2`, 4/4 green per job (TypeScript Check · Test Suite · Build · Docker Build); `ce44019e2` differs from `551e13bc1` only in `PAPER_STANDARD_PROPOSAL.md` (the run on `551e13bc1` itself was cancelled by that push). **No migration. No schema change.**

## DISPATCH HEADER (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (`Scope Files/B_GUARDRAIL_FAIL_CLOSED_SCOPE.md` header) |
| ii | **doc set for `non_architecture`** (`config.mjs:130-135`) | `scope`: **present** · `pre_audit`: **present**, `B_GUARDRAIL_FAIL_CLOSED_PRE_AUDIT.md` · `completion_report`: **absent, due Step 11** · `batch_catalog`: **absent, due Step 10** · `phase_history`: **absent, due Step 10** · `system_manual`: **applicable, due Step 10** (one line: a guardrail check that cannot verify its limit refuses) · `sim`: **applicable, due Step 10** (trade-safety checks + the RTB metrics reason list) · `changes_and_fixes`: **applicable, due Step 10** · `running_issues`: **applicable** (`#1081` closes at Step 10; `#698` am.4 and `#1084` am.1 landed in this commit) · `roadmap`: **judged N/A** · `deleted_log`: **N/A**, nothing removed · `adjustment_framework`: **N/A** · `phase_19_plan`: **applicable, due Step 10** (row `4.a`) · plus `MEMORY` (Langston's nit) |
| iii | **Step-2 reference** | `Scope Files/B_GUARDRAIL_FAIL_CLOSED_PRE_AUDIT.md` at `692088a40` — cleared by Langston 2026-09-28 with one condition, folded |

## FILES
| file | change |
|---|---|
| `server/services/trade-safety.ts` | the two catches refuse with `GUARDRAIL_READ_FAIL` |
| `server/services/rtb-metrics-service.ts` | `RtbBlockReason` + both runtime lists name `CORRELATION_EXPOSURE` and `GUARDRAIL_READ_FAIL` |
| `server/tests/unit/b-guardrail-fail-closed.test.ts` | NEW — 22 tests |
| `1-system-manual/RUNNING_ISSUES.md` | `#698` am.4 wording (`:385` is a silent substitution on a blocking check), `#1084` am.1 (the `/test/` routes contaminate live counters) |

## THE TWO CATCHES
BEFORE (`:319-321`):
```ts
  } catch (error) {
    console.error(`[8.8.3-H4] Error checking cooldown:`, error);
    return { ok: true };
  }
```
AFTER:
```ts
  } catch (error) {
    const _msg = error instanceof Error ? error.message : String(error);
    console.error(`[8.8.3-H4] Error checking cooldown: [B-GUARDRAIL-FAIL-CLOSED][CHECK_THREW check=COOLDOWN mode=${mode}] ${trade.symbol}: ${_msg} — refusing, the cooldown cannot be verified`);
    return { ok: false, code: 'GUARDRAIL_READ_FAIL', reason: 'cooldown check failed — the cooldown cannot be verified, refusing' };
  }
```
BEFORE (`:669-671`): `console.error('[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR]', error); return { ok: true };`
AFTER: `console.error(\`[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR] [B-GUARDRAIL-FAIL-CLOSED][CHECK_THREW check=MAX_TOTAL_EXPOSURE mode=${mode}] …\`); return { ok: false, code: 'GUARDRAIL_READ_FAIL', reason: 'total exposure check failed — the cap cannot be verified, refusing' };`
Both old tags are kept inside the new lines, so existing greps still match.

## THE METRICS LISTS (your Step-2 condition: the class, not the instance)
`RtbBlockReason` gains `'CORRELATION_EXPOSURE' | 'GUARDRAIL_READ_FAIL'` before `'OTHER'`; `normalizeBlockReason`'s known list and `initializeBlockReasons` gain both. `CORRELATION_EXPOSURE` has been emitted live at `trade-safety.ts:821` and counted as `OTHER` until now.

## TESTS AND MUTATIONS
The REAL `checkGuardrailRisk` is driven with only its data boundaries stubbed (`storage`, `guardrail-settings`, diagnostics). CONTROL: no fault ⇒ pass. The cooldown fault is raised at `storage.getGuardrailsV2` (its only caller in the file); the exposure fault at `getPortfolioBalanceV2` (its only caller, `:631`). Each asserts `ok === false`, **`code === 'GUARDRAIL_READ_FAIL'`**, and the log tag; the exposure case also asserts the metrics bucket (`GUARDRAIL_READ_FAIL` 1, `OTHER` 0). **The class fence:** the 17 members of `TradeSafetyResultCode`, read from the type's own declaration with comments stripped (a count assertion proves the parser reads them), each round-trip through `rtbMetricsService.recordBlock` under its own name, never `OTHER`.
**Mutations, all 6 KILLED:** cooldown catch back to `ok: true` · exposure catch back to `ok: true` · a refusal with the wrong code · `GUARDRAIL_READ_FAIL` dropped from the known list · `CORRELATION_EXPOSURE` dropped from the known list · the cooldown log tag dropped. **tsc:** no errors in the touched files; neither has baseline entries.

## JUDGEMENT CALLS I WANT ATTACKED
1. **The class fence reads the type from source.** A `Record<RtbBlockReason, number>` exhaustiveness construct was your alternative; I chose the test because it also fences the RUNTIME lists, which a type cannot. Acceptable?
2. **The log keeps the old tag at the front** (`[8.8.3-H4] Error checking cooldown: [B-GUARDRAIL-FAIL-CLOSED]…`) so any existing alert or grep on the old string still fires; the new tag is what new greps use.
3. **A thrown check now drops the promoted signal** (removed from the RTB pool, not restored, `ACTIVE_PATH_FLOW.md:249`). That is the fail-closed trade, stated in the scope; a transient database fault during a promotion pass costs the signals it touches.

## ✅ STEP 4 — APPROVED at `551e13bc1` (Langston, 2026-09-28), three record-side conditions and two nits, all folded
| # | item | disposition |
|---|---|---|
| C1 | The ledger amendments cited pre-edit line numbers in the commit that moved them. Class rule: a ref cited in a commit that also moves lines is stamped post-edit. | **Done:** `#698` am.4 now `:360` / `:398` / `:394` / `:365-376`; `#1084` am.1 now `:715` (all at `551e13bc1`). The sizing scope's census rows carry both refs. |
| C2 | `#1084` am.1 read as if the `/test/` contamination were fixed here. | **Done:** reworded (homed at `4.b1`, not fixed by `#1081`), plus what `#1081` changed: a `/test/` call that throws now mints `GUARDRAIL_READ_FAIL` in the live counters. |
| C3 | The `GUARDRAIL_READ_FAIL` bucket aggregates FOUR emitters: `trade-safety.ts:328` cooldown threw, `:373` `maxPositionPercent` unreadable, `:650` `maxTotalExposurePct` unreadable, `:685` exposure read threw. The count is not a diagnosis; the log tag is the only discriminator. | **Step 10:** stated in the completion report and the SIM entry. |
| NIT-1 | The catches logged `error.message` only; the old lines carried the stack. | **Done:** the Error object is appended as the second `console.error` argument, on the same line (no line moved). |
| NIT-2 | The class fence proved `normalizeBlockReason`'s list but not `initializeBlockReasons`'s. | **Done:** one test asserts every code is present at 0 after `reset()`; mutation (drop `CORRELATION_EXPOSURE` from `initializeBlockReasons` only) KILLED. 23 tests. |
**§13:** `#1086` `B-GUARDRAIL-POLICY-ORPHAN`, row `4.b2`. **Step 8 observable (Langston):** `CHECK_THREW` lines in `error.log`; **zero post-deploy is an UNEXERCISED path (`#661` leg 3), never a pass.** **Deploy note:** Step 6 rides on the branch head, which carries other sessions' undeployed commits; the ride-along set is named at the deploy.

## STEP 6 — DEPLOYED (recorded 2026-11-14; the deploy itself was 2026-10-06)
The Step-3 code `551e13bc1` and the Step-4 nits `bcfdee7a0` are both ancestors of release deploy B `3576d3981` (2026-10-06T15:45Z, `git merge-base --is-ancestor`, both true), so the fix has been live since then. **Staging now runs `9591ba8c22d2c0fb9adfd822d85462709e211ef9`** (record `/home/deploy/dawntrader-deploy.record`, deployed 2026-11-14T01:40:58Z, restart 699; `dist/BUILD_SHA` matches), which also carries both commits. **The running build holds the code:** `grep -c "CHECK_THREW check=COOLDOWN\|CHECK_THREW check=MAX_TOTAL_EXPOSURE" dist/index.js` = 2. No separate deploy was needed; Steps 6-11 were not recorded at the time — the batch stalled after Step 5 and is resumed here.

## STEP 7 — FIRST-PASS VERIFICATION (CC-C, 2026-11-14 ~04:35Z)
| objective | result | evidence |
|---|---|---|
| OBJ-1 cooldown catch refuses | **YES (by test)** | `server/tests/unit/b-guardrail-fail-closed.test.ts`: **27 of 27 pass** (run at `5e8c0ae30`; the test file, `trade-safety.ts` and `rtb-metrics-service.ts` are byte-identical there, at the head `4e062985c` and at the deployed `9591ba8c2`, `git diff --quiet`) (`npx vitest run`, local, 2026-11-14). Step 4 recorded 23; the file has since grown (later batches). The error branch cannot be induced on staging (scope OBJ-4 honest limit). |
| OBJ-2 exposure catch refuses | **YES (by test)** | same file. |
| OBJ-3 census | **YES** | written into the pre-audit and Step-4-approved; unchanged since. |
| OBJ-4 no behaviour change | **YES — zero fires, which is UNEXERCISED, not a pass** | **Instrument:** `grep -c CHECK_THREW` over every `/var/log/dawntrader/error__*.log` archive plus live `error.log`. **Reach:** oldest archive `error__2026-11-01` starts `2026-10-31 00:00:03` → live, i.e. **2026-10-31 → 2026-11-14 ~04:30Z** (the archives before 10-31 have rotated out, so 10-06 → 10-30 is outside the instrument). **Result: 0 lines in all 15 files.** **Positive control, same files, same stream:** `GUARDRAIL_BLOCK] code:MAX_TOTAL_EXPOSURE` / `code:COOLDOWN` lines = 8, 1, 1, 16, 491, 2, 8, 159, 835, 1,163, 528, 866, 468, 531, 1 (per file, oldest first) — the stream holds guardrail lines at volume, so its silence on `CHECK_THREW` is informative. Per Langston's Step-4 rule this is an **unexercised** path (`#661` leg 3), consistent with the scope's 0-in-14-days baseline; it is not evidence the catch fires correctly — the tests are. |
| metrics name the code | **YES** | live `GET /api/diagnostics/rtb-metrics` (via `dt-api`, HTTP 200, 2026-11-14): `byBlockReason` carries `GUARDRAIL_READ_FAIL: 0` and `CORRELATION_EXPOSURE: 0` as their own keys, `OTHER: 0`; `COOLDOWN: 1` shows the counter is live since the restart. |
| UI | **NO UI SURFACE — stated, not skipped** | no client file reads `rtb-metrics`, `byBlockReason` or `GUARDRAIL_READ_FAIL` (`git grep` over `client/src` at the ref: none; control: the same grep finds `api/diagnostics` in three client files). The refusal surfaces only in the error log and the diagnostics API. |
**Residual:** the 10-06 → 10-30 window is outside the log instrument's reach, so zero fires there is not established; the scope's pre-deploy baseline was also 0 in 14 days.

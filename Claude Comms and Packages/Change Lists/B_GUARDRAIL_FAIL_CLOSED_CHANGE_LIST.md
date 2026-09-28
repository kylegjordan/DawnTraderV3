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

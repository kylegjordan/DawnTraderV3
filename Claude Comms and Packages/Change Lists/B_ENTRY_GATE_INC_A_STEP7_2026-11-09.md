# B-ENTRY-GATE (#1224) — INCREMENT A STEP 7, FIRST FULL SESSION

**Registered window:** 2026-11-09 14:30:00Z–21:00:00Z, the first full U.S. regular session after increment A entered staging at `e0e68dfdbd497033c8c6b22222949b13c9c3c4b1` on 2026-11-07.
**Read:** 2026-11-09 21:00Z–23:45Z · **owner:** NEW Codex (`codex-b`) · **alert:** `801330ae-ce0f-45e7-84a3-3b9b72692c6e`.

## Verdict

**Increment A's live fill gate did not cross its refusal ceiling, but the registered open-rate INVESTIGATE line fired.** The active xStock fill population was only one taker plus two makers: the taker passed at `adverseR=-0.098802`, and there were no active fill-window or fill-economics refusals. The equal prior-session xStock open count fell from 18 to 3, but the investigation separates that fall from this batch: upstream xStock paper admissions rose 246 → 324, while 648 of 650 failed promotion attempts in the read window were the pre-existing maximum-total-portfolio-exposure guardrail.

**One promised Step-7 magnitude is unavailable, not zero.** The scope and pre-audit register a watch-only friction-coverage shadow keyed by `entry_friction_coverage_k`, but the deployed/current tree has no runtime reader, computation or archive field for it. This is a Step-8 finding for Coltrane; the report does not fabricate a value.

## Registered increment-A magnitudes

| registered item | xStock result | crypto result | verdict |
|---|---|---|---|
| Active taker fill-window refusals | **0 refused / 1 accepted taker = 0%**, `n=1`; the accepted row is SPG/USD | no taker fills (`n=0`); one maker fill | below the 25% INVESTIGATE ceiling; sample too small to test the 3–8% expectation |
| Accepted-fill `adverseR` | one measured taker: **−0.0988019**; makers correctly carry no `adverseR` | no accepted taker | recorded, non-vacuous xStock control |
| Fill economics (P4) | 3 accepted fills, 0 refusals; `netEvAtFill` min/median/max **0.956119 / 1.107620 / 4.757540** | 1 accepted fill, 0 refusals; `netEvAtFill=0.00268218` | the four rows all carry `fillEconRefused=false`; no refused row |
| Missing-win-probability shadow (A-12) | **3/3** accepted fills have `pWinDefaulted=true` and `missingPWinWouldRefuse=true` | **0/1** | recorded shadow; it never decided this increment |
| Cheaper-side P1b | **0/1** measured taker fills below the 0.40 floor; SPG `remainingRiskFrac=0.901198` | no measured taker | no close outcome owed for a below-floor member because there was no member |
| Drift alarm | 0 `[11.8B][EV_REJECT_SHADOW]` lines in the registered logs; 0 `ev_reject` rows in the sink | same | observed zero, but **not exact-path control-proved**: all-time sink controls are `maker_taker` and `sqe_shadow`, with no all-time `ev_reject` positive event |
| Exploration opens | 0 of 3 xStock opens, versus 0 of 18 in the equal prior session; all carry `admissionBasis=organic` | 0 of 1, versus no prior-session crypto open | no change; the organic rows are the positive control |
| P3 maker would-cancel | **0** would-cancel resolutions; positive control: 2 xStock maker fills resolved (TSLA, TGT) | **0**; positive control: 1 crypto maker fill resolved (ETHFI) | observed zero with the resolution path active |
| Friction-coverage shadow | **unavailable** | **unavailable** | instrumentation promised in the plan is absent from runtime code and archive schema |
| Active opens, equal full session | **18 before → 3 after**, down 83.3% | **0 before → 1 after**, ratio undefined | xStock INVESTIGATE line fired; cause isolated below |

### VTS P3v, kept separate from active fills

The same logs contain **6 xStock taker-twin entry-window skips** and **119 xStock taker twins opened**, so the window refusal share over those two comparable twin outcomes is **6/125 = 4.8%**. There were 0 crypto twin window skips and 0 crypto twins opened, and 0 direct VTS `ENTRY_WINDOW_REFUSED` lines for either class. This is a VTS twin population, not the active-fill denominator above.

## The open-rate INVESTIGATE

The comparison is the immediately preceding full U.S. regular session, 2026-11-06 14:30–21:00Z, against the registered 2026-11-09 window.

- `closed_trades` paper opens: xStock **18 → 3**; crypto **0 → 1**.
- `signal_eval_archive`, `source=signal-orchestrator`, xStock paper admissions: **246 → 324**. The candidate supply did not halve.
- The paper book began the two windows with 18 and 16 open positions respectively, against `maxTrades=20`; the registered window repeatedly had 5–6 open slots.
- Failed paper promotion attempts: **1 before** (`DEPTH_GATE: hollow_book spread_blown`) versus **650 after**. In the registered window, **648/650** were `GUARDRAIL_BLOCK: Max Total Portfolio Exposure exceeded`; the other 2 were `MAKER_MARKETABLE_DROPPED`.
- Session closes were 16 xStock before (10 stop, 1 target, 5 never-filled) and 4 after (1 stop, 3 target). The later session therefore recycled fewer positions too.

**Finding:** the threshold hit is real, but its observed mechanism is the existing portfolio-exposure guardrail repeatedly refusing promotions, not P1/P4. No B-ENTRY-GATE rollback or patch follows from the open-rate line.

## Objects and positive controls

1. **Durable fill rows:** `signal_eval_archive`, exact timestamp window, `source='active-execution-engine'`. Source-count control over all 678,101 archive rows in the window found six sources and exactly 4 engine rows; all 4 rows were read in full.
2. **Trade/open comparison:** `closed_trades.opened_at`, exact equal windows. `metadata.admissionBasis='organic'` is present on every measured open; there were no exploration-stamped opens.
3. **Upstream flow:** `signal_eval_archive`, `source='signal-orchestrator'`, exact windows. The read finds admitted and SQE-refused rows in both windows.
4. **Rotating logs:** the complete registered span crosses `out__2026-11-09_11-15-15.log` and `out__2026-11-09_19-23-45.log`; `out.log` and `error.log` were included as boundary/current controls. Exact timestamp filtering was applied after pattern matching. Maker fills and 119 VTS twin opens are the positive controls for the zero P3/direct-refusal cells.
5. **Drift sink:** `switch_on_shadow_evidence`; all-history proof-type census finds `maker_taker` 1,657,794 and `sqe_shadow` 1,660,114, but no `ev_reject` proof type. Therefore the registered-window zero is stated with its missing exact-path control.
6. **Restart/deploy record:** staging git reflog, `/home/deploy/dawntrader-deploy.record`, and PM2 process metadata. Staging HEAD moved after the increment-A landing at `e0e68dfdb` through `c0fe598a0`, `6c39f14cb`, `d01da3d86`, `942c65424`, `1d4be9cf7`, `4f9fe259f`, then `5c3b14496` at 2026-11-08 01:31Z. PM2 `created at=2026-11-08T01:31:28.898Z`, restart 687, uptime 46h at read: **no restart or HEAD movement inside the registered session**.
7. **CI:** increment-A landing run `42376198522` and the build that served the session, run `42431079807`, each show TypeScript Check, Test Suite, Build and Docker Build individually `success`.
8. **Server/API:** PM2 online, 0 unstable restarts; local health HTTP 200; authenticated `dt-api GET /api/vts/filter-diagnostics` returned `ok:true` at 2026-11-09T23:45:03Z.

## Instrument gap — friction-coverage shadow

The positive-control census is `git grep` at HEAD: it finds the promised setting name `entry_friction_coverage_k` in `B_ENTRY_GATE_PRE_AUDIT.md`, and finds `missingPWinWouldRefuse` in the pure fill-economics result, engine archive writer and unit test. It finds **no runtime occurrence** of the friction-coverage setting or a corresponding recorded result. `FillEconomics` returns the deciding net EV plus the A-12 missing-pWin shadow, and `_fillEconRecord` writes those fields; neither computes or writes the registered `net reward >= k × round-trip friction` shadow.

REVIEWER: claim-only · identify the settling objects and alternative consistent states · **HIT: promised shadow absent from current runtime and archive producer; magnitude unavailable, not zero** · re-derived yes

## Increment boundary and UI

P2/P5/P6/P7/P8 are increment-B objects and were deliberately held off `migration/aws-supabase` until this read. Their magnitudes are **not applicable to increment A**, not zeros; increment B at reviewed ref `20404d0a4` gets its own first-full-session read after landing.

No batch UI surface exists to verify: the scope explicitly leaves the Filter Diagnostics display out of B-ENTRY-GATE. The API and durable objects above are the user-visible/operational verification surfaces; no staging password was entered.

## Step-8 reproduction recipe

Run the database block on staging as `deploy`, after loading `/home/deploy/dawntrader/.env`. It prints the six-source/678,101-row control, all four active-engine rows, the equal-window opens and closes, the 246→324 upstream-admission control, and the shadow-sink control. The sink's all-history positive-control totals continue to grow after this read; the report freezes the totals observed at read time.

```sql
\pset null '∅'
select source,count(*) from signal_eval_archive
where captured_at >= '2026-11-09 14:30+00' and captured_at < '2026-11-09 21:00+00'
group by source order by source;

select captured_at,symbol,asset_class,gate_decision->>'entryArm' entry_arm,
  gate_decision->>'entryWindowRefused' window_refused,gate_decision->>'adverseR' adverse_r,
  gate_decision->>'remainingRiskFrac' remaining_risk_frac,
  gate_decision->>'belowCheaperFloor' below_cheaper_floor,
  gate_decision->>'fillEconRefused' econ_refused,gate_decision->>'netEvAtFill' net_ev,
  gate_decision->>'pWinDefaulted' pwin_defaulted,
  gate_decision->>'missingPWinWouldRefuse' missing_pwin_would_refuse
from signal_eval_archive
where captured_at >= '2026-11-09 14:30+00' and captured_at < '2026-11-09 21:00+00'
  and source='active-execution-engine' order by captured_at;

with windows(label,lo,hi) as (values
  ('prior',timestamptz '2026-11-06 14:30+00',timestamptz '2026-11-06 21:00+00'),
  ('registered',timestamptz '2026-11-09 14:30+00',timestamptz '2026-11-09 21:00+00')),
classes(asset_class) as (values ('xstock_spot'),('crypto_spot'))
select w.label,c.asset_class,count(t.id) opens,
  count(t.id) filter(where t.metadata->>'admissionBasis'='organic') organic,
  count(t.id) filter(where t.metadata->>'admissionBasis'='exploration') exploration
from windows w cross join classes c left join closed_trades t
  on t.opened_at>=w.lo and t.opened_at<w.hi and t.mode='paper' and t.asset_class=c.asset_class
group by w.label,c.asset_class order by w.label,c.asset_class;

with windows(label,lo,hi) as (values
  ('prior',timestamptz '2026-11-06 14:30+00',timestamptz '2026-11-06 21:00+00'),
  ('registered',timestamptz '2026-11-09 14:30+00',timestamptz '2026-11-09 21:00+00'))
select w.label,count(*) from windows w join signal_eval_archive s
  on s.captured_at>=w.lo and s.captured_at<w.hi
where s.source='signal-orchestrator' and s.mode='paper_sim'
  and s.asset_class='xstock_spot' and s.reject_stage='admitted'
group by w.label order by w.label;

with windows(label,lo,hi) as (values
  ('prior',timestamptz '2026-11-06 14:30+00',timestamptz '2026-11-06 21:00+00'),
  ('registered',timestamptz '2026-11-09 14:30+00',timestamptz '2026-11-09 21:00+00'))
select w.label,coalesce(t.close_reason,'∅') reason,count(t.id)
from windows w left join closed_trades t
  on t.closed_at>=w.lo and t.closed_at<w.hi and t.mode='paper' and t.asset_class='xstock_spot'
group by w.label,coalesce(t.close_reason,'∅') order by w.label,reason;

select proof_type,
  count(*) filter(where captured_at >= '2026-11-09 14:30+00'
                  and captured_at < '2026-11-09 21:00+00') registered,
  count(*) all_history
from switch_on_shadow_evidence group by proof_type order by proof_type;
```

The complete log population is the two rotating stdout files that intersect the window plus current stdout/stderr. This exact read produces 6 entry-window twin skips, 119 xStock twin opens, 0 crypto twin opens, 0 direct VTS window refusals, 0 would-cancel resolutions, 0 drift lines, and the three maker-fill positive controls.

```bash
python3 - <<'PY'
from pathlib import Path
lo, hi = '2026-11-09 14:30:00', '2026-11-09 21:00:00'
paths = [Path('/var/log/dawntrader/out__2026-11-09_11-15-15.log'),
         Path('/var/log/dawntrader/out__2026-11-09_19-23-45.log'),
         Path('/var/log/dawntrader/out.log'), Path('/var/log/dawntrader/error.log')]
rows = [line for path in paths for line in path.open(errors='replace') if lo <= line[:19] < hi]
patterns = ['[B-ENTRY-GATE][VTS][TWIN_SKIPPED]', '[P19-B7.2c][VTS][TWIN_OPENED]',
            '[B-ENTRY-GATE][VTS][ENTRY_WINDOW_REFUSED]',
            '[B-ENTRY-GATE][MAKER_WOULD_CANCEL][SHADOW:',
            '[11.8B][EV_REJECT_SHADOW]', '[P19-B7.2c][MAKER_FILLED:paper]']
for p in patterns:
    print(p, sum(p in line for line in rows))
print('entry-window skips', sum('[B-ENTRY-GATE][VTS][TWIN_SKIPPED]' in line
                                and 'reason=entry_window' in line for line in rows))
print('xStock twin opens', sum('[P19-B7.2c][VTS][TWIN_OPENED]' in line
                               and '(xstock_spot)' in line for line in rows))
print('crypto twin opens', sum('[P19-B7.2c][VTS][TWIN_OPENED]' in line
                               and '(crypto_spot)' in line for line in rows))
print(''.join(line for line in rows if '[P19-B7.2c][MAKER_FILLED:paper]' in line), end='')
PY
```

The failed-promotion split comes from the stderr file holding each window:

```bash
for spec in \
  "prior|/var/log/dawntrader/error__2026-11-07_00-00-00.log|2026-11-06 14:30:00|2026-11-06 21:00:00" \
  "registered|/var/log/dawntrader/error.log|2026-11-09 14:30:00|2026-11-09 21:00:00"; do
  IFS='|' read -r label file lo hi <<< "$spec"; echo "$label"
  awk -v lo="$lo" -v hi="$hi" 'substr($0,1,19) >= lo && substr($0,1,19) < hi' "$file" |
    grep '\[RTB-Promotion:paper\].*Failed to execute promoted signal:' |
    sed 's/^.*Failed to execute promoted signal: //' |
    sed -E 's/(Max Total Portfolio Exposure exceeded).*/\1/' | sort | uniq -c
done
```

The code/instrument gap is checked at the pushed ref, not the working tree. Adjacent-field matches are the positive control:

```bash
git grep -n 'entry_friction_coverage_k' 873584797 --
git grep -n 'missingPWinWouldRefuse' 873584797 -- server
git grep -n -E 'friction.*coverage|coverage.*friction' 873584797 -- server migrations
git show 873584797:server/core/trading/fill-economics.ts
git show 873584797:server/services/active-execution-engine.ts
```

Deployment/restart and CI controls were read with `git -C /home/deploy/dawntrader reflog --date=iso`, `tail -n 30 /home/deploy/dawntrader-deploy.record`, `pm2 jlist`, and `gh run view 42376198522 --json jobs` / `gh run view 42431079807 --json jobs`; inspect each named job rather than the aggregate conclusion.

## Step-8 ask

Coltrane should review at the pushed ref:

1. whether the 0/1 active-taker result plus the 6/125 VTS-twin result is the honest class-separated reading of the registered window magnitude;
2. whether the open-rate investigation correctly isolates portfolio exposure rather than entry-gate behavior;
3. whether the absent friction-coverage shadow is a blocking increment-A defect, a condition to fold before increment B lands, or a separately dispositioned promise; and
4. whether the zero drift-alarm cell is acceptable with no exact-path runtime positive control.

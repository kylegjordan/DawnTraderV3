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

## Step-8 ruling — CHANGES (Coltrane, 2026-11-10T00:18:47Z)

Coltrane independently reproduced the registered populations at exact ref
`69218ca6c8a32b08afa557404c263c7dea45773d`: 678,101 archive rows and four
active-engine fills; the sole xStock taker was 0 refused / 1 accepted; VTS was
6 entry-window skips / 119 xStock twin opens (6/125 = 4.8%); xStock opens fell
18→3 while admissions rose 246→324; and 648 of 650 promotion failures were the
portfolio-exposure guardrail. He also confirmed no registered-window deploy or
restart and all four CI jobs green on attempt 2. The Step-7 market reading and
the no-rollback conclusion therefore stand.

Increment-A does **not** pass Step 8. The promised `entry_friction_coverage_k`
shadow is an increment-A P4 obligation, not a separately governed item: fold
the setting reader, computation, result, archive writer, tests, and mutation
control before increment B lands, then deploy and register a fresh full-session
magnitude because the absent historical field cannot be reconstructed. The
drift-alarm cell remains **UNVERIFIED**, not zero, until the extraction is
mutation-proved and its exact producer-to-sink path has a positive control.
Alert `801330ae` remains correctly resolved because it evidenced completion of
this read; the delivery card and increment-A closure remain blocked at Step 8.

## Correction Step-7 pre-registration — 2026-11-10 full session

**Registered at 2026-11-10T08:00:14Z, before the first eligible session and before any post-restart fill row existed.**
The correction entered staging at exact reviewed ref `957b13fde2fdb9b9c12791699b8fabeaa3a9afed` at
2026-11-10T07:48:04Z. The frozen read window is **2026-11-10 14:30:00Z–21:00:00Z**, the first full U.S. regular
session after deployment; this leaves more than six hours of restart warm-up before the window opens.

The pre-registration controls are non-vacuous and separate from the outcome: the live database has exactly two
`entry_gate.entry_friction_coverage_k` rows, one each for `crypto_spot` and `xstock_spot`, both `1.0` with
`updated_by='b-entry-gate-friction-coverage'`. At registration time the post-restart active-execution population was
**0 rows and 0 dedicated carriers**. That is the before-data state, not a measured zero and not evidence that the
carrier works.

### Frozen carrier read

The magnitude population is every durable `signal_eval_archive` row in the registered window with
`source='active-execution-engine'` and `gate_decision.gate='friction_coverage_shadow'`. Report separately by asset
class and arm:

1. carrier count;
2. complete-field count for `k`, net reward, round-trip friction and would-refuse; ratio may be null only when friction
   is exactly zero;
3. min / 25th percentile / median / 75th percentile / max of the full friction-coverage ratio;
4. the count and share below the watch-only `k=1` line; and
5. net-reward and round-trip-friction ranges in price units.

The watch-only line has **no rollback ceiling**: its purpose is to return the magnitude to Kyle. It must not be read as
an admission decision. A missing/changed class setting, a non-finite carried field, a nonzero count of
`[B-ENTRY-GATE][FRICTION_COVERAGE][ARCHIVE_FAILED]`, or a terminal fill-economics row with no same-symbol/same-arm
carrier in the preceding 60 seconds is a verification failure. Dedicated carriers may outnumber terminal rows because
the carrier is deliberately written before later entry-window, economics, duplicate, race or insert exits. If the
session contains no carrier rows, the result is **unavailable**, not zero; active fill-economics rows with no carrier
are a defect.

The deployment identity is re-read after 21:00Z from the deploy record, running `BUILD_SHA`, PM2 metadata and git
reflog. Any restart or code movement inside the registered window invalidates the window. The complete stdout/stderr
rotation span intersecting the window is enumerated from file boundaries before pattern extraction; a known line in
each selected stream is the file/read control.

The drift-alarm cell stays separate. A registered-window absence of `[11.8B][EV_REJECT_SHADOW]` or `ev_reject` sink
rows may be reported only as **UNVERIFIED** unless the extraction is mutation-proved and the exact engine producer to
durable sink path has a positive control. Adjacent `maker_taker` / `sqe_shadow` rows do not satisfy that condition.

`REVIEWER: claim-only · name the objects that would settle the drift-control condition and the materially different
states consistent with them · HIT—the correction retains the old unproved extractor and adjacent sink/counter tests,
not a full active-engine-to-durable-row positive control · re-derived y`. Re-derivation at the deployed ref confirmed
the static producer call and sink adapter, but the sink test mocks the batch writer, the drift test calls only the
in-memory counter/alert latch, and the correction diff contains no drift-path or extractor change. The cell therefore
remains UNVERIFIED unless a real exact-path event or a new controlled full-path object settles it.

No batch UI surface is introduced by the correction: it writes an internal durable shadow carrier and leaves Filter
Diagnostics explicitly out of scope. Step 7 therefore verifies the live durable carrier, settings, logs, process and
database objects; there is no affected staging panel to navigate.

```sql
\pset null '∅'
with carrier as (
  select captured_at,symbol,asset_class,
         gate_decision->>'entryArm' arm,
         (gate_decision->>'frictionCoverageK')::double precision k,
         (gate_decision->>'netRewardAtFill')::double precision net_reward,
         (gate_decision->>'roundTripFrictionAtFill')::double precision friction,
         (gate_decision->>'frictionCoverageRatio')::double precision ratio,
         (gate_decision->>'frictionCoverageWouldRefuse')::boolean would_refuse
  from signal_eval_archive
  where captured_at >= timestamptz '2026-11-10 14:30:00+00'
    and captured_at <  timestamptz '2026-11-10 21:00:00+00'
    and source='active-execution-engine'
    and gate_decision->>'gate'='friction_coverage_shadow'
)
select asset_class,arm,count(*) n,
       count(*) filter(where k is not null and net_reward is not null and friction is not null
                       and would_refuse is not null and (ratio is not null or friction=0)) complete,
       min(ratio),percentile_cont(0.25) within group(order by ratio),
       percentile_cont(0.50) within group(order by ratio),
       percentile_cont(0.75) within group(order by ratio),max(ratio),
       count(*) filter(where would_refuse) below_k,
       min(net_reward),max(net_reward),min(friction),max(friction)
from carrier group by asset_class,arm order by asset_class,arm;
```

## Correction Step-7 result — 2026-11-10 full session

**Read at 2026-11-10T21:06Z over the frozen 2026-11-10 14:30:00Z–21:00:00Z population. Verdict:
PASS for the correction's registered carrier gate.** All 11 dedicated carrier rows were complete; all 11 terminal
fill-economics rows had the same-symbol/same-arm carrier 145–254 ms earlier; both class settings remained the registered
`k=1.0`; and none of the registered verification-failure conditions fired. The comparison remains watch-only: no
admission or refusal decision consumed it, and there was no rollback ceiling.

| asset class | arm | carriers / complete | ratio min / p25 / median / p75 / max | below `k=1` | net-reward range | round-trip-friction range |
|---|---:|---:|---:|---:|---:|---:|
| crypto | maker | 1 / 1 | 5.000233 / 5.000233 / 5.000233 / 5.000233 / 5.000233 | 0/1 (0%) | 0.016125125–0.016125125 | 0.003224875–0.003224875 |
| crypto | taker | 0 / 0 | unavailable | unavailable — no carrier population | unavailable | unavailable |
| xStock | maker | 5 / 5 | 16.979228 / 17.370641 / 22.332144 / 26.438880 / 31.646783 | 0/5 (0%) | 3.255044–11.494541 | 0.145756–0.435731 |
| xStock | taker | 5 / 5 | 2.723994 / 5.208088 / 6.961747 / 15.969044 / 16.727528 | 0/5 (0%) | 0.090855–13.969983 | 0.017445–0.874817 |

The durable source control counted 22 active-execution-engine rows in the session: 11 dedicated carriers plus 11
terminal admitted rows. The complete terminal enumeration matched 11/11 within the registered preceding-60-second
rule, with 0 missing. The carrier population was PSA, ANET, ED, SNAP, ARM, JUP, CRWD, DLR, CDNS, KMB and MRVL; the
crypto taker cell is unavailable rather than a measured zero because no crypto taker was evaluated.

### Verification-failure checks and controls

- The live settings population was exactly two wildcard-key rows, one per class, both `1.0`, last written at
  `2026-11-10T07:47:52.322784Z` by `b-entry-gate-friction-coverage`.
- The three log files intersecting the frozen window were enumerated before extraction:
  `out__2026-11-10_14-57-46.log` (window control `14:30:00`, last row `14:57:50`), `out.log` (first row
  `14:57:50`, last pre-cutoff control `20:59:59`), and `error.log` (window controls `14:30:00` and `20:59:59`).
  Across exactly those files and the frozen timestamps, `[B-ENTRY-GATE][FRICTION_COVERAGE][ARCHIVE_FAILED]` was
  0. The same read returned 6 xStock VTS entry-window twin skips and 6 maker fills; stderr independently returned 374
  paper RTB-promotion rows, so both selected streams and the timestamp filter had positive controls.
- Deployment identity stayed fixed: the deploy record, staging HEAD and running liveness `buildSha` were all
  `957b13fde2fdb9b9c12791699b8fabeaa3a9afed`; the last reflog move and process start were 07:47Z, restart count stayed
  688, and unstable restarts stayed 0. There was no restart or code movement inside 14:30–21:00Z.
- CI run `42740349578` at the deployed SHA remained individually green for TypeScript Check, Test Suite, Build and
  Docker Build. The process was online, expected and running; the authenticated diagnostics endpoint returned HTTP
  200. The general health endpoint also returned HTTP 200 / `ok:true`, but honestly remained `healthy:false` on the
  already-known soft memory warning (762.59 MB against its 350 MB threshold); this is not reported as a green health
  envelope and is not a B-ENTRY-GATE carrier failure.

The drift-alarm cell remains **UNVERIFIED**, not a pass or a measured zero. The frozen logs contained no
`[11.8B][EV_REJECT_SHADOW]` event and the durable sink still contained only `maker_taker` and `sqe_shadow` proof types
(467 and 110 rows inside this session; 1,658,440 and 1,660,249 all-history at the read). Those are positive controls
for the sink read but not for the exact active-engine-to-`ev_reject` path, so the correction does not promote this
separate cell beyond Coltrane's existing condition.

`REVIEWER: claim-only · name the settling objects and materially different states consistent with the correction's
carrier-completion claim · CLEAN—no carrier-gate contradiction; the separate drift-alarm cell was excluded from the
claim · re-derived n/a (CLEAN is recorded but is not evidence)`

### UI disposition

No affected staging panel exists: the correction adds only a durable internal shadow carrier and the registered scope
keeps Filter Diagnostics out. The database, logs, live settings, running process and authenticated diagnostics endpoint
are therefore the complete affected surfaces; no password was entered and no unrelated dashboard was treated as this
batch's UI.

## Correction Step-8 ruling — CONFIRMED (Coltrane, 2026-11-10T21:34:13Z)

Coltrane independently reproduced the registered carrier gate at exact evidence ref
`56509024d94c8a7ed987fe06b7dd9e3321dbcf7f`. His staging read found exactly 22 active-engine rows: 11 complete,
finite and arithmetically consistent `friction_coverage_shadow` carriers plus 11 terminal `admitted` rows. All 11
terminals matched the same symbol and arm 145–254 ms earlier; the registered 60-second check found 0 missing, while a
100 ms mutation found 0/11 matches and proved that the instrument turns red for the failure class. The class/arm
aggregates matched, 0/11 carriers were below `k=1`, and crypto taker remained unavailable rather than zero.

The settings population independently reproduced as exactly two wildcard class rows at `1.0`, with the registered
writer and timestamp. The complete three-file log extraction reproduced `ARCHIVE_FAILED=0` with 6 twin skips, 6 maker
fills and 374 paper RTB-promotion rows as positive controls. Staging HEAD and liveness still identified deployed ref
`957b13fde2fdb9b9c12791699b8fabeaa3a9afed`; the last ref move/process start remained 07:47Z, restart count 688,
unstable restarts 0, with no session movement. Coltrane requested no carrier-gate change. The separate drift cell
remains **UNVERIFIED**, not zero or pass, because its exact `ev_reject` path still lacks a positive control; no affected
UI panel exists.

## Correction Step-9 all-objectives check — 2026-11-10

**Verdict: every increment-A objective is green; no further fix loop is required.** The check was re-run at
`2026-11-10T21:49Z` in the current branch, whose governed runtime and targeted-test files have no diff from deployed
ref `957b13fde2fdb9b9c12791699b8fabeaa3a9afed`. The targeted population was eight test files and 130 tests; all eight
files and all 130 tests passed. This supersedes the correction change list's earlier 100-test count because this
Step-9 rerun deliberately includes the distance guard, refresh-log writer and drift-disposition suites as well.

| increment-A item | object re-checked | result |
|---|---|---|
| P1 worse-side fill window + P1b cheaper-side shadow | boundary/wiring tests plus the registered active-fill population | exact +25% edge passes, one tick above refuses, cheaper fills never refuse; the live session retained the non-vacuous xStock taker control |
| P3 resting-maker record + P3v VTS entry window | maker lifecycle and all three VTS call sites, plus the registered log population | watch-only maker state cannot feed cancel/drop/fill; six xStock twin skips among 125 comparable twin outcomes supplied the live VTS control |
| P4 fill economics | pure kernel, both engine arms, exploration exemption, conversion path and registered durable rows | the actual arm at the paid price remains the deciding number; 11/11 terminal rows carried a preceding complete friction-coverage carrier and 0/11 observations were below `k=1` |
| P4b snapshot disposition | disposition and alert-latch tests plus deployed source | missing-snapshot outcomes remain unreachable, paper remains shadow and live retains the block. The real-session drift-event cell is still **UNVERIFIED**, not green or zero; it is not used as evidence for this row because no exact-path live positive control exists |
| P5 increment-A boundary | the ranker, shadow-pool and promoted-open target sites at the deployed ref | all three governed `entry x 1.02` fallbacks remain absent; target-less rows rank last, skip shadow simulation, or refuse `invalid_target`. A repo-wide same-pattern control still finds two unrelated 1.02 calculations elsewhere, proving the census can return positives. The SQE `InvalidTarget` rule remains explicitly in increment B |
| P9 refresh diagnostics | ESM-writer tests and staging files | transition-only trace, SQE rejection, and warn-on-failed-write checks pass. Staging holds four dated trace files; the current file had 1,176 rows and the rejection file had one row at the read, so file existence is not inferred from an empty directory |
| A-9 dead constant | deployed server tree, with historical specification documents as the positive control | `ENTRY_PREMIUM_BPS` remains absent from runtime server code while the same ref still finds the historical specification occurrences |
| correction setting/carrier | live settings, durable archive, log span and deployment identity | Step 7 and Coltrane independently reproduced two class settings, 11 complete carriers, 11/11 terminal matches, complete log controls and no restart or ref movement inside the frozen session |

The delivery-board item was re-read at the object: `Status=Verification`, `Review=Approved`, `Blocked on=Langston`.
It stays in Verification through governance, as the Step-9 rule requires. Increment-B objectives P2/P6/P7/P8/P11/P12
are outside this increment and remain on their separately reviewed ref; they are not recorded as zeros or implied done.

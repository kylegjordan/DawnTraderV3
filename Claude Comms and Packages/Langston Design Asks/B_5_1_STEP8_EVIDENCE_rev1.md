# B-5.1 Step-8 second-pass dispatch — staging evidence package

**From:** Claude New (CC-B) · 2026-06-12 ~01:15Z
**Deployed:** `5737b1ddb` (fast-forward from `2b3fc83ba`; contains the approved B-5.1 code at `56def88c9` + docs/memory commits). Build clean, pm2 online, only the known-benign `/home/runner` EACCES line in error.log.
**Deploy timestamp (THE D1/D2 boundary record): `2026-06-12T01:01:56Z`** — this is the intra-epoch-4 DBS-stamp boundary AND the shadow-week evidence annotation timestamp. Goes verbatim into CHANGES_AND_FIXES + completion report.
**CI on staging head:** run `27387317555` completed success (all 4 jobs) — the head commit beyond `56def88c9` is docs/memory only.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. Use `ssh staging` for any repo-side inspection.

## Verification evidence, per scope criterion

### 1. #222 equity drain + purity (O1) — PASS
Store is in-memory, restarts empty; the test is that it REFILLS pure. At +6min:
- Audit script `probe_dbs_class_purity` (registry-based `safeResolveAssetClass`): **PASS, n=180, zero non-crypto symbols.**
- Pre-deploy contaminated baseline (recorded 2026-06-11 ~17:30Z): n=462 with 24 equity-looking symbols at 52.0% weight, score 0.2833.
- Adjudication note: the baseline's "24 equity symbols" heuristic list overcounted by at least GRASS/USD — GRASS is a genuine Kraken crypto token and the registry resolves it crypto_spot. The substantive contaminants (SPY/QQQ/NVDA/AAPL/TSLA/...) are all gone.

### 2. Audit script — ALL 13 SCORED LEGS PASS (run 2026-06-12T01:07:49Z on staging)
```
vote_retally            crypto  EXACT  n=51   maxDev=0  PASS
dbs_weighted_median     crypto  1e-6   n=180  maxDev=0  PASS
dbs_partition_parity    crypto  loose  n=180  maxDev=0  PASS (snapshot age 6s)
friction_recompute      crypto  EXACT  n=500  maxDev=0  PASS
vote_retally            xstock  EXACT  n=55   maxDev=0  PASS
dbs_weighted_median     xstock  1e-6   n=416  maxDev=0  PASS
dbs_partition_parity    xstock  loose  n=416  maxDev=0  PASS (snapshot age 19s)
friction_recompute      xstock  EXACT  n=360  maxDev=0  PASS
netpnl_expectededge     both    1e-6   n=152  maxDev=0  PASS (0 misses; tautology=76 unexplained=0)
equity_z_scores         xstock  1e-6   n=1    maxDev=0  PASS (dxy window n=1 honestly skipped)
probe_wildcard_aggressive_rows  db     n=2    maxDev=0  PASS (per-class rows only)
probe_dbs_class_purity  crypto  zero-non-crypto n=180   PASS
probe_xstock_staleness_identity xstock n=1            PASS (ev_gap_warming(n=0/30))
```

### 3. #224 restart-IDLE proof (O3) — PASS, caught live in the ledger
The deploy restart itself served as the restart test. `amr_decision_ledger` rows post-01:01:56Z:
```
01:02:32  crypto_spot  IDLE    ["vote_idle_or_warming"]     mode=null  shadow
01:02:32  xstock_spot  IDLE    ["friction_warming"]         mode=null  shadow   <- the exact transient that used to stamp false CALM
01:03:02  crypto_spot  CHOPPY  ["ev_gap_warming(n=0/100)"]  DEFENSIVE  shadow   <- first LIVE read, <= NORMAL ✓
01:03:02  xstock_spot  IDLE    ["friction_warming"]         mode=null  shadow
01:03:32  crypto_spot  CHOPPY  ["ev_gap_warming(n=0/100)"]  DEFENSIVE  shadow
01:03:32  xstock_spot  STORMY  ["ev_gap_warming(n=0/30)"]   SURVIVAL   shadow   <- first LIVE read, <= NORMAL ✓
```
xstock friction warmed by +5min (score 83, n=360). Both classes: IDLE during warm-up, first LIVE ≤ NORMAL (post-IDLE cap honored).

### 4. #223 crossed-quote guard (O2) — FIRED LIVE 18 TIMES (corrected per Langston Step-8; original rev looked in the wrong log)
**CORRECTION (Langston Step-8 catch):** the rejection line emits via `console.warn` → stderr → `error.log`, not `out.log` where the original grep looked. Actual evidence: **18 rejections in `/var/log/dawntrader/error.log` within the first ~10 minutes post-deploy** (e.g. `[CostCache][B-5.1] crossed-quote spread rejected for ALEO/EUR (-1) — non-measurement, not cached`; also AURA/EUR, BABYSHARK/EUR, CGN/EUR). All carry the −1 sentinel — stale tickers with a missing ask side, the exact non-measurement case. Independently re-verified by CC after Langston's flag. The guard is not just armed — it is demonstrably catching live bad quotes and refusing to cache them. The 4-test unit matrix remains the behavioral spec proof.

### 5. PREVIOUSLY-STATED-VS-NOW (§9.2)
**PREVIOUSLY STATED:** post-fix crypto DBS "settles ~0.227-region" (vs 0.2833 contaminated). **NOW:** reads 0.508 (UP_MODERATE) at n=180 mid-fill. **REASON:** that expectation was pinned to a snapshot taken ~7.5h before deploy; DBS is a live market quantity and the market moved. Per critical rule 13 (snapshots are not decision-grade), the integrity criterion is the registry-purity probe (PASS) + the allowlist diff + unit tests — not a stale score pin. Flagging this verbatim in the completion report.

### 6. No UI surface changed in B-5.1
The AMR panel legend's IDLE row (B-5) already covers warm-up IDLE; no new UI claims are made, so no Claude-in-Chrome pass is claimed or required for this sub-batch.

## The ask
Step-8 second-pass: independently verify whatever subset you choose (`ssh staging` — ledger query, re-run `npx tsx scripts/b5-amr-correctness-audit.ts`, log greps). Reply CONFIRMED or flag discrepancies. Also confirm you're satisfied with the §9.2 reframing of the 0.227 criterion (item 5) — if you think a settled-store score re-check at a later timestamp still adds value, say so and I'll add it as a completion-report annotation rather than a gate.

# P19-B8.5e — COMPLETION REPORT: risk-derived per-symbol mark-staleness ceiling (`#548`)

**Phase:** 19 · **Owner:** CC-B · **change-class:** `architecture` · **Closed:** 2026-07-22
**Head at close:** `80ed5ca2a`+ (see §4.5 — batch NOT closed on the original claim; head citation corrected per Langston's staleness nit) · **CI:** 4/4 GREEN on **`a4508353b`** — ancestry-verified to contain ALL FOUR B8.5e commits

> ⚠️ **CITATION CORRECTED — Langston caught this at Step-8, before it hardened into the record.** I originally cited `73346765f` as *"contains all B8.5e commits."* **It does not.** It is a `B-REPO-RELOCATE` commit that landed BETWEEN my round-2 and my seam/hotfix, so it contains `e48a623da` + `56750fef5` and **NOT** `4f67d3d2a` (the test seam) or `1f0ade30e` (the staging-outage hotfix). Its green run said nothing about either. **The lesson is the one this batch kept re-learning: a commit being GREEN and a commit CONTAINING your work are two different facts, and "it was the head when I looked" establishes neither.** Re-verified per commit with `git merge-base --is-ancestor`, not by position in a run list. The wrong citation is recorded here rather than silently swapped.
**Langston:** Step-4 **APPROVED** (re-read at the ref, twice — round 1 at `e48a623da`, round 2 at `56750fef5`)

---

## 1. What shipped, in one paragraph

Replaced the single global `exit_integrity.max_equity_tick_age_ms` (90,000ms, applied to every xStock alike) with a **per-symbol, per-position ceiling**:

```
ceiling = clamp( budget / σ_effective , floor_ms , cap_ms )
budget  = budget_k × (remaining room to the stop, as a fraction)
```

so **tolerance shrinks as danger rises** — a position near its stop gets the tightest window, because that is exactly when acting on a wrong price costs most. The old constant was simultaneously **too loose** on the fastest symbol (blind to ~4% of adverse movement) and **too tight** on the safest (refused to manage it 49×/24h on ordinary quiet trading). One number cannot serve symbols whose risk-per-second differs ~11×.

## 2. Objectives

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Per-symbol σ measurement, fail-closed | **YES** | `sigma-rate.ts`; windowed, `(symbol, captured_at)`-bounded, Promise.race hard-timed; 8 tests |
| 2 | Pure, unit-testable ceiling policy | **YES** | `mark-staleness.ts`; 16 tests; every degenerate path → floor |
| 3 | Self-σ must be EARNED | **YES** | below `sigma_min_observations` a symbol inherits the conservative 90th-pctile class-wide σ |
| 4 | Near-stop gets the tightest tolerance | **YES** | solved *in the same knob* — budget is a fraction of remaining room |
| 5 | Exit path wired, non-blocking | **YES** | `active-execution-engine.ts`; sync cache read, async refresh never awaited |
| 6 | Boot assertion, xstock_spot only | **YES** | `b72-warmup.ts`; 10 knobs + coherence (floor<cap, 0<budget_k<1, refresh<maxAge) |
| 7 | §18 retire the replaced constant | **YES** | forward migration DELETEs it; rollback RESTORES it |

## 3. ★ TWO FAIL-**OPEN** HOLES FOUND IN REVIEW — both in code I wrote, both fixed at the find

Recorded prominently because in both cases **my own module header claimed a safety property the code did not have.**

**(a) STALE-LOW σ (found by ANALYST; verified in code before accepting).** σ is in the **denominator**, so a **low σ WIDENS** the window. My guards covered σ = *null* — but null is not the dangerous value, **a small-but-wrong σ is**. Quiet symbol ⇒ low measured σ ⇒ symbol gets busy ⇒ cached σ is still the quiet one, is not null, no guard fires ⇒ we accept an older mark **precisely during the volatility that makes an old mark worthless**, next to a stop. The header said *"fail-closed everywhere… never the widest"*; against a volatility regime change **that was false**.
**FIX:** σ is inflated by its **own age** (`sigmaAgeInflation`) — a ramp toward the floor, not a cliff. Unknown age ⇒ maximally stale.

**(b) CLASS-WIDE σ NEVER EXPIRED (found by Langston).** It was refreshed-or-**kept**, never dropped at `maxAge`, so a persistent refresh outage left the last-good value feeding every not-yet-earned symbol forever — same bad direction if class-wide volatility rose during the outage.
**FIX:** expired on the same bound. The "everything ages toward the floor" invariant now holds **without an asterisk** — and the branch is **pinned by test** (Langston's ask: *an untested expiry branch IS the asterisk*).

## 4. Scope DROPPED on evidence — LULD

The planned `luld_tier` column + S&P500/Russell1000 index-membership plumbing was **removed**. At `cap_ms` = 300,000 (exactly the 5-minute LULD reference window) the σ-derived drift for our fastest symbol is **2.06%** against a Tier-1 band of **5%**. The band binds only above σ > 1.67e-4/s = **2.4× MU**. ⇒ **the σ ceiling is always the tighter constraint at this cap**, so LULD would add an index-membership data dependency for a bound that can never bind. Revisit trigger recorded in the migration: `cap_ms` above ~727s. Langston: *"AGREE, overrule declined"*, independently reproduced.

## 4.5 ⚠️⚠️ AMENDMENT BEFORE CLOSE — THE HEADLINE CLAIM IS NOT TRUE FOR MOST SYMBOLS

**This section exists because §1 of this report claimed the 49-refusals-per-24h problem was fixed, and within an hour of deploy I disproved that with live measurement. Langston's close gate (ruling (b), 2026-07-22) is that this amendment lands BEFORE the batch closes.**

**The mechanism shipped and is correct** — Langston passed Step-8 on the code, and the ceiling behaves exactly as specified. **But it is fixed only for the FOUR symbols that can EARN their own σ, not the ELEVEN that inherit:**

| earn own σ (≥200 obs/30min) | inherit class-wide σ |
|---|---|
| MU 385 · SKHY 350 · INTC 326 · ORCL 246 | TSM 181 · QCOM 100 · BMNR 96 · MARA 67 · BABA 64 · NOC 39 · **CDNS 35 · PM 26 · ARKK 21 · MOS 17 · C 17** |

**★ FOR ARKK IT IS A REGRESSION — and ARKK is the original 49-refusals victim that started `#548`.** The constant this batch removed was **90s**. ARKK's mark at **69–79s** was **accepted** under the flat rule and is **refused** under its inherited-σ **55s** ceiling. It re-alerted within the hour. Venue-quiet supplies the stale mark; **my seed supplies the over-strict refusal**; ARKK needs both to alert, so "venue-quiet, not a regression" is not separable here.

**TWO COMPOUNDING CAUSES, and the second is the real one:**
1. `sigma_min_observations = 200` was seeded as a guess at "enough history", never checked against real tick density — 11/15 held symbols cannot reach it.
2. **★ THE DESIGN DEFECT: the inherited class-wide σ is a 90th percentile computed ONLY over symbols with ≥200 observations (`sigma-rate.ts:178-181`) — the busiest, most volatile names — and then applied to the thinnest.** The estimator systematically dresses the calmest symbols in the busiest symbols' volatility.

**DISPOSITION (Langston ruling (b), NOT (a)):** both the threshold and the inheritance-population go into **`#566`** through the full workflow. **Lowering the threshold alone is symptom-only** — §8 #11 no-patches — and a night knob-edit on a system already taken down once that day is precisely the "fix correct behaviour, inject a new bug" failure. **Conservative behaviour stands meanwhile:** over-refusal costs opportunity, not capital, and nothing is unexitable. Safe-but-strict beats a rushed partial fix.

**★ TWO TAILS (Langston, on re-read at `80ed5ca2a`):** `#566` originally captured only the **widening** tail — a stale-LOW σ trusting an old mark during volatility (the danger direction). **ARKK is the opposite tail: an inherited-HIGH σ refusing a mark it should have trusted.** Same root (σ used ≠ symbol's true σ), opposite sign, and **a fix for one can worsen the other** — the `WHERE obs >= minObservations` clause gates the inherited-σ POPULATION as well as eligibility, so moving the threshold moves both. Any fix must state its effect on both tails.

**★ ARKK RELIEF THIS SOAK IS KYLE'S DECISION, not Langston's and not mine** — accepting an older mark moves the risk posture, and risk posture is Kyle's. Surfaced to him; not actioned unilaterally.

**★ LANGSTON REVERSED HIS OWN "not a regression" LINE** on re-reading the formula, the inheritance design (`SYSTEM_MANUAL.md:4551`) and the seed — the decisive corroboration being this report's OWN premise at line 20 (*the old constant was too tight on the safest, refused 49×/24h*): a conservative-high inherited σ handed to a thin-but-genuinely-calm ETF **reproduces exactly that failure mode**. Taxonomy: **bucket 2, working-as-designed-but-unaddressed — the CLAIM fails, not the build.** PASS on the code stands.

**HOW THIS WAS FOUND, recorded because it is the transferable part:** not by review — by **alerts firing after I had already reported success**. Every one of this batch's errors was a confident claim resting on something unmeasured. This one I caught only because the system contradicted me.

## 5. ⚠️ KNOWN LIMITATION — state it plainly, do NOT let "B8.5e fixed staleness" stand unqualified

- **The floor overrides the budget.** Where the budget-derived ceiling falls below `floor_ms`, drift can exceed the budget: **MU at 0.10% room floors to 15s and can drift 0.103% — 2.06× the budget, 1.03× the room.** i.e. **on a fast symbol within ~0.1% of its stop, the stop can be crossed inside the blind window.** Not fixable by lowering the floor (a sub-second ceiling refuses on every ordinary tick gap — the 49×/24h symptom that started `#548`), and **not created by the ceiling**: near the stop with a stale mark we are exposed *either way*. That is **`#563`** — our stop is evaluated IN-PROCESS, so it dies with our own liveness. **Mitigated, not removed.**
- **Now MEASURED, not argued:** distinct skip reason `equity_tick_stale_floor_bound_near_stop` fires only when `room < σ_effective × floor` (stop genuinely crossable). **Its live first-fire is UNOBSERVED** — no position has gone stale near its stop since deploy. Wired and unit-tested; not yet seen in production.
- **σ still lags a spike.** The age-inflation bounds the *damage*; it does **not** make σ track faster — a freshly-refreshed σ is still measured over a 30-min window, diluting a 2-minute-old spike to 2/30 of the sample. Homed as **`#566`** (Phase-25).

## 6. ★ INCIDENT — I took staging down for ~2 minutes, and my own assertion blamed the wrong thing

The boot check reads knobs via `getCachedNumberRequired`, a **sync** read against the warm module-constants cache. I added the assertion and the migration but **never added `mark_staleness` to `PREFETCH_MODULES`** — module never warmed, sync read threw, server refused to boot. **The assertion's text said "migration has not been applied" while the migration HAD been applied** (verified: 10 rows seeded, retired row deleted, crypto 0). The true cause appeared only in the wrapped inner error.

**Lessons, written into the code at the line:**
1. **A knob existing in `module_constants` is NOT sufficient for a sync caller** — its module must be listed in `PREFETCH_MODULES`.
2. **A fail-closed assertion must not assert a CAUSE it has not checked.** Mine claimed a migration state it never queried. Including the wrapped inner error is the only reason this cost one read instead of a hunt.
3. **Deploy-ordering:** I applied the retiring migration while the OLD code was still running, so for ~4s every xStock position logged `knob unavailable — fail-safe skip`. It failed **safe** (skip, never act on an unvalidated mark) — the designed behaviour — but **a retirement DELETE should land with its code, not before it.**

Hotfix `1f0ade30e`.

## 7. Verification

- **CI:** 4/4 GREEN on **`a4508353b`** — TypeScript Check (baseline gate), Test Suite, Build, Docker Build; ancestry-verified against all four B8.5e commits (see the corrected citation in the header).
- **Tests:** 33 new (16 policy + 8 σ + 9 cache), all passing.
  ⚠️ **Evidence correction, made publicly:** the `C:\dev` bench was **172 commits behind origin**, so the "tsc baseline clean" I cited at Step-4 was against a **stale baseline** and was NOT verification against origin. All four changed files were byte-identical bench↔working-tree, and the tests are pure/seam-based, so they exercised the real code — but **the authoritative gate is CI on origin**, and that is what this report rests on.
- **DB:** 10 `mark_staleness` rows seeded for `xstock_spot`; `max_equity_tick_age_ms` count = **0**; `crypto_spot` count = **0** (deliberately unseeded — no crypto σ read-path exists; absent beats inert).
- **§9.3 UI-NAVIGATED** (not curled): Paper Trading → Open Trades — **Active Trades (15), System 15 / UI 15, Status OK, Slots Available 0**; every row carries a **live Current price beside Entry** with Dist. T/S and Gross P/L populated (MOS 22.7321→22.8350, NOC 530.0000→524.5750, QCOM 176.0600→175.9700). Open-position value moved across reads ($1,315.65 → .62 → .99 → .72), confirming live marking.
- **Runtime:** `[EVAL_EXIT] positionsEvaluated=15 withWsPrice=15 withRestPrice=0 withoutPrice=0` — **zero skipped**. These are the positions that were fail-safe-skipping before.

## 8. Governance files changed

`1-system-manual/RUNNING_ISSUES.md` (#548 → RESOLVED; **filed #566** σ-lag residual, **#567** re-homing task #85) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `SYSTEM_MANUAL.md` (exit-path staleness model — architecture/math, APPLICABLE) · `SYSTEM_IMPACT_MAP.md` (3 new components + the σ-cache cross-cutting state) · `CHANGES_AND_FIXES.md` · `DELETED_COMPONENTS_LOG.md` (§18 retirement) · `.claude/memory/MEMORY_CC_B.md` · this report.

## 9. Ledger movements

- **`#548` RESOLVED** — this batch.
- **`#566` OPEN (new)** — σ measurement lag / 30-min window dilution; proposed `max(short-σ, long-σ)`; **Phase-25**.
- **`#567` OPEN (new)** — re-homes task **#85**, whose *"superseded by the LULD adoption"* disposition became **FALSE** when this batch dropped LULD. Its real concern — **a mark can be perfectly FRESH and still WRONG, and nothing checks its VALUE** — is untouched here. Home: **`B-XSTOCK-PRICE-PLAUSIBILITY-BAND`**, Phase-25.
- **`#563` unchanged** — the real fix for the near-stop exposure; explicitly **not** closed by this batch.
- Caught while filing: I had referenced **`#564`** in a code comment, but #564/#565 are CC-C's. **Repointed to #566 before it became a dangling pointer to someone else's issue.**

# B-BOOK-STATE-RESTART-DURABLE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Owner:** CC-C · plan row `3n.q8` · `#1066` · scope `B_BOOK_STATE_RESTART_DURABLE_SCOPE.md` (r1, `6e2c5ec20`, **Step 1 APPROVED by Langston 2026-09-24 13:40Z**).
**Status:** `STEP: 2 of 11` DONE · `NEXT STEP: 3 of 11`. **r2 — Langston APPROVED r1 2026-09-24 14:02Z (re-derived at `b7bb41e93`, not ruled on reported fact), with one deploy BLOCKER and four conditions, all folded below as §6.** §0 was written first because it was the time-sensitive part.

---

## 0. THE POSITIVE CONTROL, CAPTURED NOW (Langston's Step-1 condition 1)

**Why now, not at Step 8:** `console.warn` lines go to `error.log`, which staging keeps as daily files for about 14 days (the oldest on disk 2026-09-24 is `error__2026-09-11`). The control event is 2026-09-19. The deploy is held to after 2026-09-30, and OBJ-6 needs a second restart after that, so waiting would lose the evidence (`#1044` class).

**Captured:** every `[BOOK_STATE]` line in `/var/log/dawntrader/error__2026-09-20_00-00-00.log`, the file covering 2026-09-19 00:00:00 → 23:59:59Z. That is **498 lines, 108,066 bytes**, untruncated, filed as `Scope Files/B_BOOK_STATE_RESTART_DURABLE_CONTROL_2026-09-19.txt`. The sha256 prefix `18ea0c9b48f33247` matches on staging and on the local copy.
- **Counts by kind (whole file):** 245 ANET REFUSE · 105 AMC REFUSE · 76 LOW REFUSE · 59 ANET SKIP · 7 REFUSAL_BASIS (ANET 3, AMC 2, LOW 1, MDB 1) · 2 MDB REFUSE · 1 ANET YIELD · 1 ANET SEED_IMPLAUSIBLE · 1 ANET COMPARATOR_CLEARED · 1 AMC SKIP.
- ⛔ **NOT CAPTURABLE, stated so no one looks for it: `COMPARATOR_SEEDED`.** It is written with `console.log` (`book-state-tracker.ts:279`), so it went to `out.log`. On 2026-09-24 staging keeps 14 rotated `out__` files of about 25 minutes each, and nothing from 2026-09-19 survives. **The seed fact is carried instead by `REFUSAL_BASIS`** (`seedRetainedMedian`, `retainedMedianNow`), which is `console.warn` and is kept.

**THE CONTROL, in five lines from that file** *(log prefixes and some fields trimmed for width; the full lines are in the file)*:
```
2026-09-19 00:02:43  ANET/USD REFUSAL_BASIS seedImplausible=false seedSpread=0.00436 seedRetainedMedian=none retainedMedianNow=none ... seededAt=2026-09-19T00:02:42.914Z
2026-09-19 00:16:29  ANET/USD COMPARATOR_CLEARED reason=yield_after_60_hollow validated=true framesSinceSeed=488 observedMovement=true ringAfter=true
2026-09-19 00:16:30  ANET/USD SEED_IMPLAUSIBLE seedSpread=0.32368 retainedMedian=0.00415 kRel=3
2026-09-19 00:16:30  ANET/USD REFUSAL_BASIS seedImplausible=true seedSpread=0.32368 seedRetainedMedian=0.00415 retainedMedianNow=0.00415 ratio=78.03
2026-09-19 00:54:15  ANET/USD REFUSAL_BASIS seedImplausible=false seedSpread=0.32368 seedRetainedMedian=none retainedMedianNow=none ratio=none seededAt=2026-09-19T00:54:15.224Z
```
- **The same seed spread (0.32368) is JUDGED and refused at 00:16:30** (ratio 78.03 against a retained median of 0.00415, which the 00:16:29 clear wrote with `ringAfter=true`). **At 00:54:15, one restart later, it is ACCEPTED VACUOUSLY** (`retainedMedianNow=none`). Nothing else differs, and that is the defect in one comparison.
- **There were two restarts that night, and both show it.** At 00:02:43 all four held names (ANET, AMC, LOW, MDB) seeded with `seedRetainedMedian=none`. At 00:54:15 AMC also seeded vacuously, at spread 0.05185 against its own earlier 0.00370.
- **What the later restarts can and cannot show:** the error files for the 2026-09-21T21:19Z and 2026-09-22T14:38:49Z restarts hold **6 and 0** `[BOOK_STATE]` lines for the whole day. So those restarts are **not** usable controls. Their seed evidence was `console.log`, and it has rotated away.

## Step-1 conditions carried into this document (Langston, 13:40Z)

1. **Q2 (a):** split the failure modes. If the whole store is unreadable, fall back to empty maps and alert. If a single row is invalid, skip that row, keep the rest, and count it.
2. **Q2 (b):** the boot alert is dedupe-keyed. It is **resolved, never acked**.
3. **Q3:** record-only is right *pending measurement*, not settled. His S25b ruling was made against a ring whose life was bounded by the process, so it is **not** cited for this. OBJ-4's read publishes the **downtime-age distribution of restored rings** beside the judged/vacuous split.
4. **SIM and System Manual are REQUIRED rows** in the Step-10 ledger, whatever the `sub_batch` class says. That covers the S25b amendment, a new store component, and the §3.5.1a rewrite.
5. **State it plainly:** a restored ring is consumed at the first plausible seed exactly like a clear-written one (`:313`). **It judges one seed and is gone. Persistence does not create a standing yardstick.**

---

## 1. THE AUDIT — sources read

| # | source | read |
|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | `book-state-tracker.ts` in full (478 lines); the importers; `server/index.ts` boot (`:880-905`) and shutdown (`:1630-1650`); `trade-safety.ts:891-915`; `external-macro-feed.ts:50-58, :194, :528-560` |
| 2 | runtime logs + DB | §0 (the error logs of 2026-09-19/21/22); `pm2 jlist`; `active_open_positions` by class |
| 3 | `SYSTEM_IMPACT_MAP.md` | S25, S25b (and S26 for the restart count) |
| 4 | `SYSTEM_MANUAL.md` | §3.5.1, §3.5.1a, §3.5.1b |
| 5 | ledger + reports | `#1066`, `#958`, `#943`; `8a-P4a` scope and audit; row `3n.c` |
| 6 | `bridge/canonical/` | **not applicable** — the guard was built 2026-09-03, after the governance change; the provenance is in the scope §4 |

## 2. FINDINGS

**A1 — THE CENSUS (§9.5(a)).** Both stores are **module-private `const`s** (`:128`, `:137`), not exported, so only this file can touch them. That is the structural evidence behind the counts below; the grep only enumerates them.
- `_retainedSpreads`: **write** exactly one (`:400`, in `clearBookStateComparator`); **delete** exactly one in production (`:313`, at a plausible seed), plus the test reset `:478`; **read** four: `:162` refusal basis, `:240` the escape, `:292` the seed judgement, and `:406`'s `.has` in the clear log line *(r2: Langston's count; r1 said three)*.
- `_comparators`: **write** `:315` (advance); **delete** `:402` (clear); **read** `:140`, `:157`, `:215`, `:364`; test reset `:478`.
- **Importers:** `active-execution-engine.ts:488` (static: assess, advance, clear, takeChainRefusalBasis) and `routes.ts:13009`, `:13141` (dynamic, `assessBookStateNow` only, a read).
- ➕ **What a fresh reader added, each re-derived at the ref:**
  - `clearBookStateComparator` is reached from **two** paths, the hollow-skip yield in the engine and the reseed escape inside `advance` (`:266`). So the counts above are per **call site**, not per entry path.
  - `takeChainRefusalBasis` writes `refusalBasisLogged` directly on a stored chain (`:159`, called `aee:2143`). That is a bookkeeping flag, not ring data, so the snapshot never reads it.
  - `readBookStateComparator` (`:139`) returns the **live** object. Its only caller is inside this module.
  - Paper and live engines share both maps (engines are per manager, `active-portfolio-manager.ts:67`). That is by design (SIM S25: market data, per-mode-safe), so **one store serves both modes**.
⇒ **One writer path, the engine's exit loop. Node runs it on one thread, so a snapshot built synchronously is consistent with no lock.**

**A2 — ENTRY POINTS.** The only driver is the engine's exit loop (`checkOpenPositions`), which runs on the engine's own interval (`aee:1209`) through `advance` and `clear`. **No OTHER timer, boot hook or route writes either store.** *(My first draft said "no timer"; the loop itself is timer-driven, and the fresh reader caught it.)*

**A3 — THE r5 GATE IS INLINE, NOT NAMED** (`:399`). Sharing it with the snapshot means extracting it first; that is the literal form of Langston's constraint.

**A4 — HOW OFTEN THE STORES ARE EMPTIED.** `restart_time` read **596** on 2026-09-03 (SIM S26), **623** at the `8a-P3` extract on 2026-09-15, and **627 live now** (last start `2026-09-22T14:38:49.748Z`, 0 unstable restarts). That is **31 restarts in 19 days**, and every one empties both stores.

**A5 — THE WORKING SET IS SMALL.** At 2026-09-24 ~15Z, `active_open_positions` holds **8 rows, all crypto, 0 xStock**. S25 holds only names held or resting since the last restart. S25b has no eviction by design, so a persisted S25b grows to **at most the xStock universe** × one ring of ≤ `ringCap` (20) numbers. The store is tiny.

**A6 — THE ENGINES RESUME BEFORE ANY STATE IS LOADED, SO THE RESTORE MUST GO FIRST.** One boot sequence in `server/index.ts` (the same async function, run in order): `resumeActiveEngines()` at **`:510`** starts the engines and their exit loops, `loadTrailingStates()` runs at **`:897`**, and `server.listen` at **`:994`**. ⇒ **The ring restore must complete BEFORE `:510`**, or the first exit-loop pass can seed vacuously before any ring is back. *(The fresh reader's lead; re-derived by reading `:470-512` and `:866-905`.)* The trailing-state load **exits the process** if it fails (`[TEC_BOOTSTRAP_FAIL]`). A lost trailing state is a wrong exit state, so hard-fail is right there. **A lost ring is today's behaviour**, so per Langston's Q2 ruling the ring restore, which sits ahead of every engine before `:510`, **fails permissive with an alert**. The two rules differ for a stated reason; that is not an inconsistency.

**A7 — TWO STORAGE PATTERNS EXIST.** JSON files in `/tmp` (trailing states, B65.2; the macro feed, B67.1). Row `3n.c` measured that `/tmp` there is disk-backed and survives a reboot, but a systemd rule ages that directory. The other option is a database table: it survives a rebuilt box and can be read with SQL, and the migration path is `drizzle/migrations` + `MANIFEST.txt` with the rollback file in git.

**A8 — WHICH LOG LINES SURVIVE (the instrument's reach).** `COMPARATOR_SEEDED` is `console.log`, which goes to `out.log`, and staging keeps about 6 hours of that (14 files of ~25 min, measured today). `REFUSAL_BASIS`, `SEED_IMPLAUSIBLE` and `COMPARATOR_CLEARED` are `console.warn`, which goes to `error.log`, kept about 14 days. **Anything the verification or OBJ-4 must read later has to be written with `warn`.**

**A9 — THE PROVENANCE BIT HAS NOWHERE TO LIVE TODAY.** S25b's value is a bare `number[]`, so the chain that wrote a ring, and whether its seed was judged or vacuous, is lost at the clear. OBJ-3 needs S25b to carry `{spreads, seedBasis, writtenAtMs}`, which changes the three readers (A1).

**A10 — A RESIDUAL GAP, STATED.** Between a plausible seed (which consumes the ring, `:313`) and that chain's first observed movement, "the ring a clear would leave" is **empty**. A restart inside that gap is still vacuous, exactly as a clear inside it is today. Persisting cannot close this without contradicting the approved definition (OBJ-1) and Langston's condition 5 (a ring judges one seed and is gone).

**A11 — SIM AND SYSTEM MANUAL ARE BOTH SPECIFIC AND BOTH GO STALE WITH THIS.** SIM S25b says *"in memory"*; System Manual §3.5.1a carries the restart paragraph and the *"do not restart during a blowout"* caution. Both are content updates at Step 10 (Langston condition 4).

**A12 — CALIBRATION, AND A SECOND SOURCE OF UNJUDGED SEEDS.** Every `REFUSAL_BASIS` line with `seedRetainedMedian=none` in the error logs on disk: the **14 dated files** (oldest `error__2026-09-11`, covering 2026-09-10) plus today's `error.log`. The older restarts are out of reach. *(r2: r1 said "15 files", counting today's log as a dated file.)*
- **2026-09-19 00:02:43 and 00:54:15: six lines, right after the two restarts** (§0).
- **2026-09-21 15:50-15:53 (AMC, SPCE) and 2026-09-23 14:17 and 20:06 (OKTA, CEG): four lines NOT near any restart.** These are a symbol's **first** chain since the last restart, a newly held name with no ring yet: the genesis case (`3n.q5`'s ground).
- ⚠️ **What this does NOT count:** `REFUSAL_BASIS` prints only when a chain **refuses**, so a vacuous seed that validated at once never appears. These are a floor, not a total.
- **Each of the four is the FIRST exit tick after its open** (Langston's timing, re-derivable from `closed_trades.opened_at`): AMC opened 15:50:40.851 → seed 15:50:41; SPCE 15:53:11.766 → 15:53:13; OKTA 14:17:00.404 → 14:17:00; CEG 20:06:01.734 → 20:06:02. That confirms genesis.
- ⛔ **r1 OVERSTATED what persistence reaches here; this is the measured split** (`closed_trades`, lifetime holds, re-derived 2026-09-24): **SPCE 1, OKTA 1, CEG 1** — each only the hold that produced the seed. **Persistence cannot reach them by construction:** no earlier chain ever wrote a ring. **AMC 3** (2026-09-16 → 09-21) is the one in reach, and no `ringAfter=true` line exists for it on disk, so **even that is unproven**. ⇒ **Of the four non-restart seeds, persistence reaches at most one.** The rest are `3n.q5`'s genesis ground.
- **Calibration scale:** the exits this changes are a small set, but not zero.

**A13 — OUT OF REACH, NAMED.** The `8a-P4c` VTS xStock hollow-book guard is future work with **separate state** (System Manual §3.5.1b: *"shared predicate, separate state"*). This store covers the paper lane's tracker only. Whether that guard's state persists is its own decision when it is built.

## 2b. OUT OF SCOPE, FOUND HERE — with its disposition (§9.4)

**The trailing-exit state loads AFTER the engines resume** (`:510` before `:897`). The B79 comment above `:897` says it moved that load before `server.listen` to close *"a race window where a paper-fill could land before its TEC state was restored"*, but the engines' exit loops start earlier still. **This is a HYPOTHESIS, not a verified defect.** Whether a monitoring pass actually runs in that gap depends on the loop interval and on how long boot takes between the two lines, and I have not measured either; the boot log lines that would show it are `console.log` and have rotated away.
**DISPOSITION: added to an existing batch, `3n.c` `B-TRAILING-STATE-DURABILITY` (mine), as an item for its Step 1** — measure the gap on the next restart before calling it a defect.

**REVIEWER:** claim-only (mode B) · the census and the no-persistence claim · 4 leads (the escape clear path, the flag write, the live-object reader, the boot order) · each re-derived at the ref: y. The boot-order lead **changed P6**.

## 3. THE PLAN — each item names the finding it falls out of

| # | item | from |
|---|---|---|
| P1 | Extract `retainsRing(chain): boolean` (`!seedImplausible && observedMovement && spreads.length > 0`). `clearBookStateComparator` calls it; behaviour byte-identical. | A3, OBJ-1 |
| P2 | Change S25b's value to `{ spreads: number[], seedBasis: 'judged' or 'vacuous', writtenAtMs: number }`. `seedBasis` comes from `prev.seedRetainedMedian != null` at the clear. The three readers (`:162`, `:240`, `:292`) read `.spreads`; nothing else changes. | A9, OBJ-3 |
| P3 | `snapshotRetainableRings()`: for every symbol in the union of both maps, take the live chain's ring if it passes `retainsRing` (basis from that chain), otherwise the S25b entry, otherwise nothing. Built synchronously, so it is consistent. ⛔ **Rests on NAMED INVARIANT I-1 (§6 C4), fenced by a mutation-proved test.** | A1, A2, OBJ-1, I-1 |
| P4 | Store: table `xstock_book_state_rings` (`symbol` PK, `spreads double precision[]`, `seed_basis` in {judged, vacuous}, `source` in {live, retained}, `written_at`, `persisted_at`). Migration + rollback file, **both in git**, MANIFEST forward-only. | A7, OBJ-5 |
| P5 | Writer: one module, `book-state-ring-store.ts`. **A full snapshot every 30 s** (upsert present, delete absent) **plus a flush in the shutdown sequence** beside `persistTrailingStates`. A failed write logs, counts, and **never throws into the exit loop**. Crash loss is bounded by 30 s. | A1, A6, OBJ-5 |
| P6 | Restore **before `resumeActiveEngines()` (`server/index.ts:510`)**, so no exit loop runs before the rings are back. **Per row:** finite positive spreads, `1 <= length <= ringCap`, known basis; an invalid row is **skipped and counted**. **Whole store unreadable:** empty maps plus alert `book-state-ring-restore-failed`, whose body says **RESOLVE, never ACK**. Only S25b is restored; `_comparators` starts empty. | A6, OBJ-2, Langston Q2 (a)(b) |
| P7 | `console.warn` lines, so they survive for the reads: at boot, `RING_RESTORED n= skippedInvalid= judged= vacuous= ageMin p50/p90/max`; at a seed that consumes a restored ring, `RESTORED_RING_CONSUMED symbol ringAgeMs seedBasis verdict=plausible or implausible`. These are OBJ-4's downtime-age distribution and OBJ-6's evidence. | A8, OBJ-3, OBJ-4, Langston Q3 |
| P8 | Tests against the **real** tracker, each mutation-proved: the shared predicate (breaking it in the snapshot fails a test); the snapshot's three cases; restore with a partial store and with an unreadable one; **a restored ring consumed at the first plausible seed** (condition 5); the basis follows the chain; the §0 sequence replayed (the same 0.32368 seed is refused after a restore, where today it is accepted). | OBJ-1, OBJ-2, OBJ-3 |
| P9 | Step 7: after the deploy (**no earlier than 2026-10-02T20:10Z**, §6 C3), **one more restart**, during US regular hours and never in a spread blowout, **timed off a non-empty `xstock_book_state_rings` table (one query)**. ⛔ **PRE-REGISTERED NON-VACUITY FLOOR (Langston's BLOCKER): `RING_RESTORED n >= 1` AND `RESTORED_RING_CONSUMED >= 1` with a verdict; otherwise the result is INCONCLUSIVE-EXTEND and waits for the next restart, NEVER a pass.** When the floor is met, pass means every restored symbol that seeds is **judged**, not vacuous. Control: §0. ⚠️ **P9 proves WIRING only. The MECHANISM proof is P8's §0 replay, and P9 does not carry the verdict alone.** | OBJ-6, §6 C1 |
| P10 | Step 10: SIM S25b amendment plus a new row for the store; System Manual §3.5.1a rewritten, with the caution removed **only after P9 passes**. | A11, condition 4 |
| P11 | The calibration line: **impact NAMED, not epoch-bumped** (§6 C2, Langston's ruling). | A12, OBJ-7 |

**UNAUDITED items in the plan: none.**

## 4. QUESTIONS FOR LANGSTON AT STEP 2

- **Q1 — P2's type change** (the provenance rides inside S25b) against a parallel map. **Recommendation: the type change.** One entry per symbol cannot drift from its own provenance; a parallel map can.
- **Q2 — P5's cadence, 30 s.** Crash loss is bounded by it, and the store is tiny (A5).
- **Q3 — P11, the calibration line.** **Recommendation: "no calibration impact", reason stated.** The exits it changes are unjudged seeds on hollow books, which the design never meant to be vacuous; the on-disk floor is 10 such lines in 14 days, and only 2 of those seeds were hollow. If he rules a bump instead, it is `xstock_spot` `paper_sim` +1.

## 5. IN PLAIN LANGUAGE

The xStock price check keeps a short record of how wide each stock's buy/sell gap normally is, and judges every fresh price against it. That record lives only in memory, so each of the 31 restarts in the last 19 days wiped it, and the first price after a restart was trusted without a check. The plan saves that record to the database every 30 seconds and on shutdown, and loads it back before trading resumes. It keeps one note per record saying whether it came from a checked price or an unchecked one. If loading fails, the system behaves exactly as it does today and raises an alarm. It is proven by replaying the ANET night, where the same price is refused after the fix, and by one real restart after 30 September.

## 6. r2 — LANGSTON'S STEP-2 RULING, FOLDED (2026-09-24 14:02Z)

**Q1 — the type change: TAKEN.** His stronger reason: changing S25b's value makes the **compiler** list every reader, and a parallel map lists none. All call sites read `medianOf(ring)`; `:406`'s `.has` is untouched.
**Q2 — 30 s: TAKEN.** A ring is built over hundreds to tens of thousands of frames, so 30 s of crash loss is noise. The shutdown flush is the normal path, and the 30 s snapshot earns its place on a hard kill alone.

**C1 — ⛔ BLOCKER on the DEPLOY, not the build: P9 could pass on an empty store.** Folded into P9 above: the pre-registered floor, INCONCLUSIVE-EXTEND when it is not met, and the restart timed off a non-empty table. His measurements, recorded as his:
- 0 xStock positions right now.
- Exactly one `COMPARATOR_CLEARED` with `ringAfter=true` since that field shipped on 09-19.
- 4 restarts in the last 9 days (623 → 627), not the 1.6 a day the 19-day figure in A4 implies.

**C2 — Q3: NO epoch bump, but NOT "no calibration impact". That wording was false and is withdrawn.** Refusing a seed changes when a stop fires; the 09-19 ANET row is a false `stop_hit`. The record reads **impact NAMED, not epoch-bumped**, for these reasons:
- A bump resets every xStock learning aggregate (`outcome-feedback-store.ts:358`, his cite).
- It would be a second corpus reset inside `B-XSTOCK-FEE-CONTRACT`'s window.
- The contamination floor is 10 lines in 14 days, and persistence reaches at most 1 of the 4 non-restart ones (A12).

**The two things he wanted back, measured, not asserted:**
- **(a) Did `8a-P4b` already bump the xStock paper epoch? YES.** Live `module_constants` read 2026-09-24: `xstock_spot / * / paper_sim = 6`, `updated_at 2026-09-19 00:54:05.776Z`, `updated_by b-price-side-8a-p4b-c1`. `8a-P4b` moved it 4 → 5 and its C1 moved it 5 → 6 (`ADJUSTMENT_FRAMEWORK` rule 6, second precedent).
- **(b) Why the deploy is held.** The only stated reason was the `8a-P4c` increment-1 window, which ends 2026-09-30T00:00Z; a deploy restart splits it (scope header, and `8A_P3` progress report §9.3). **Nothing else binds it.**

**C3 — THE DEPLOY HOLD MOVES TO AFTER THE FEE WINDOW (his proposal, adopted).** 2026-09-30 falls inside the final two days of `B-XSTOCK-FEE-CONTRACT`'s three-week window. That window opened with the deploy of 2026-09-11 20:09:47Z; his reading is that it ends about 2026-10-02 20:09Z. ⇒ **Deploy no earlier than 2026-10-02T20:10Z**, and the confound disappears at no cost. ⚠️ The fee window is CC-B's, so its end is **confirmed with CC-B before the deploy**, not assumed.

**C4 — INVARIANT I-1, NAMED AND FENCED (P3 rests on it).** Snapshotting a live chain's ring mid-life goes beyond "what a clear would have left". It is safe only because **`retainsRing` is MONOTONE over a chain's life: once true, it stays true.**
- `observedMovement` only ever ORs (`:288`).
- `seedImplausible` is fixed at the seed (`:289` carries it; it is set only in the `!prev` branch).
- `spreads` never shrinks below one entry under the cap.

⇒ **A ring snapshotted mid-life is one a later clear would also retain.** P8 adds a **mutation-proved fence**: if an edit makes `seedImplausible` settable mid-chain, or `observedMovement` clearable, the test fails. Otherwise P3 would silently persist rings a clear would refuse, in the permissive direction, the one that bit this mechanism at BLOCKER-3 and BLOCKER-4.

**Nits, fixed in place:** A1's read count (4) and A12's file count (14 dated + today's). **Withdrawn by him, recorded:** his own concern about P5's delete-absent; an implausible chain still holds its S25b entry (`:313`), so the union catches it.

**Board:** he has deliberately NOT set `Review = Approved` while the deploy-blocker stands, and will set it when P9's criterion comes back. The card moves to `Implementation` for Step 3.

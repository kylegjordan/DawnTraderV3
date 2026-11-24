# B-PRICE-SIDE-BY-JOB 8c-OFF-REMOVAL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Workflow:** Step 2 of 11 · **Owner:** ANALYST Codex / CC-C · **Audit code ref:** `origin/migration/aws-supabase` at `40d06d3661da2690a58ea10e2a2e832555030d70` · **Approved scope:** `B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_SCOPE.md` r2, Coltrane PROCEED at `8d9755129980a0ce012b697e3c4821a52a54b9db` on 2026-11-24T15:40:50Z.

**Step 2 ruling:** Coltrane **PROCEED** at 2026-11-24T16:45:04Z on exact OFF-BRANCH ref `7c65050f5ab377e21782cd96a9d3c1314fa82377`; CI run `45435113439` passed Build, TypeScript Check, Test Suite, and Docker Build at that exact ref. The ruling independently confirmed the mandatory parent-ordered A/B refs, the exact-`sided` active-crypto boundary, the frozen fossil allowlist, and every named red control in §§12 and 14.

This document audits first and plans second. It authorizes no implementation, migration, deployment, database write, restart, or switch change by itself.

## 0. PREVIOUSLY-STATED-VS-NOW

**PREVIOUSLY STATED:** the registered first-week read held 67 crypto paper opens on 34 symbols, all 67 stamped `sided`, with zero active-position anti-join additions.

**NOW:** at 2026-11-24T16:02:20Z, the live post-flip populations were 87 closed crypto paper rows on 46 symbols and 6 active crypto positions on 6 symbols; all 93 were `sided`, with zero `mid`, absent, or other stamps. The RTB queue held 7 total rows as a positive control and zero crypto rows.

**REASON:** the first figure is the closed registered week; the second is a later live transition census over different, explicitly named populations. New trades continued to open after the registered window.

**PREVIOUSLY STATED:** Step 1 froze a 4→3 database-row transition but did not publish a current value census.

**NOW:** at 2026-11-24T16:01:55Z, the exact live module held four rows: switch `1` (updated by KD-91 at 2026-11-16T09:45:01.351822Z), age `60000`, spread fraction `0.50`, and drift reference `0.00429`; all four used the exact `*/crypto_spot/*/*` dimensions. Phase B must prove exactly the three retained names, values, and dimensions, total cardinality three, and explicit switch absence; merely finding three expected rows is insufficient.

**REASON:** the fresh-reader challenge found that the original seed's “exactly four” predicate counts only matching expected rows and would not detect a fifth unexpected row. The final contract must close that hole rather than copy the old predicate.

**PREVIOUSLY STATED:** Step 1 described the normal cutover as code first, database second.

**NOW:** the audit makes two exact reviewed release refs mandatory under the current deploy sequence: Phase A removes every live dependency while retaining the row; Phase B alone deletes it and starts under the exact-three contract.

**REASON:** the sanctioned deployer runs migrations before restart, while the old process refreshes this database module every 60 seconds. One ref containing both changes creates a race in which the old process can see the deletion before replacement.

No other scope-time number changed.

## 1. Audit result and decisions frozen here

1. **The temporary OFF capability has no remaining runtime duty.** The switch was introduced only so 8c could ship dark before KD-91. Active crypto birth is now permanently sided; the row, reader, OFF branch, switch-only comments, and switch-only tests are removable.
2. **The shared `mid | sided` geometry contract remains.** xStock, VTS, and historical rows still truthfully use or decode midpoint geometry. Removing `mid` from shared economics would corrupt other lanes.
3. **A live active-crypto `mid` row will be refused.** The current transition population contains zero active or queued crypto `mid`/absent rows, while 93 current/post-flip active-path rows are sided. The open gate will require exact `sided`, not merely “a recognized stamp.” Historical closed rows remain readable and unchanged.
4. **The P7 level-basis funnel remains.** It is independent, live telemetry across seven production event-writer call sites and one route reader; it is not switch-only machinery.
5. **The cutover is two refs, not one.** Phase A removes all switch dependencies and deploys with the row still present. Only after Phase A is proven live may Phase B delete the row and enforce the exact-three contract.
6. **No observation window is created.** The behavior has been live since KD-91. Verification is deterministic and immediate at each exact ref; natural crypto traffic is supporting evidence, never the sole gate.

## 2. The six required sources

| # | source read | audit use |
|---|---|---|
| 1 | Actual code at exact origin ref `40d06d366...` | Read the switch reader, all four consumers, birth seam, geometry helpers, open gate, module cache, P7 writer, boot wiring, deployer, migrations, and tests as files—not search snippets alone. |
| 2 | Runtime logs, dedicated funnel file, staging database, deploy record, and Paper Trading UI | Measured the live four-row module, transition populations, current build/process, P7 survival duty, and what the UI can and cannot prove. |
| 3 | `SYSTEM_IMPACT_MAP.md` | Read S26 (crypto basis state), S27 (P7 funnel), and the wider price-side impact rows. It does not document the current 8c switch/stamp/open-gate flow; that silence is a Step-10 governance gap. |
| 4 | `SYSTEM_MANUAL.md` | Read “WHICH PRICE DOES WHICH JOB,” “LEVEL BASIS,” and “Net Execution Geometry.” The manual still presents midpoint-based formulas generally and is silent on the later 8c sided birth rebase; this is a Step-10 governance gap, not authority to reverse live 8c. |
| 5 | Ledger and batch records | Read `RUNNING_ISSUES`, `BATCH_CATALOG`, KD-91 in `DECISIONS`, the parent 8c audit/plan, its change list, the registered first-week result, and related price-feed records. No duplicate OFF-removal batch or unresolved retained duty was found. |
| 6 | `bridge/canonical/` plus git history | The canonical execution-flow corpus predates this architecture and has no coverage of the switch or geometry stamp; it only preserves general RTB intent. Git provenance identifies the always-sided constructor, temporary dark-launch switch, birth-bound stamp, and registered NO-RESULT decision separately. |

## 3. Entry points first

The repo-wide entry-point enumeration was done before tracing the removal:

| entry point | what reaches the audited state | count / mutual exclusion |
|---|---|---|
| Server boot warmup | Prefetches `level_basis`, calls the shared knob assertion, and logs the switch field today (`b72-warmup.ts:190-192,405-412`). | Exactly one boot assertion. It must become a three-knob assertion in Phase A and an exact-three structural contract in Phase B. |
| Active signal build | The crypto birth seam reads the shared knob object and branches on the switch (`signal-orchestrator.ts:630-689`). | Exactly one `.sidedEnabled` decision site. It is request/cycle driven, not a second scheduler. |
| Active per-symbol shadow | Reads the same shared knob object but consumes only age/spread (`signal-orchestrator.ts:2878-2908`). | One active shadow consumer. It survives but must move to the switchless three-knob reader. |
| VTS level-build shadow | Reads the same shared knob object but consumes only age/spread (`vts-runner.ts:1803-1832`). | One VTS shadow consumer. It survives but must move to the switchless three-knob reader. |
| Module cache refresher | Lazily starts on first prefetch and refreshes every 60 seconds (`module-constants-service.ts:343-365,508-529`). | Exactly one process-wide interval. Swap-on-success preserves the old cache on DB failure, but a successful post-delete refresh replaces it with the row removed. |
| P7 funnel writer | Boot starts one idempotent 15-minute append timer (`index.ts:1547-1551`; `level-basis-funnel-writer.ts:51-79`). | Exactly one scheduler. It is independent of the switch and remains. |

The audit aids reported no recognized top-level entry point for the symbol itself; that is a tool limitation, not an absence. The manual enumeration above includes the cycle-driven services and the lazy interval the aid does not model.

## 4. Component census at every hop

| hop / state | writers / creators | readers | mutators | deleters | schedulers / starters | disposition |
|---|---|---|---|---|---|---|
| Four-row `level_basis` module | Original seed migration; the KD-91 guarded switch flip; generic authenticated admin upsert can write a named constant. | Shared three-knob-plus-switch reader; boot; active birth; active shadow; VTS shadow. | Module cache refresh replaces the in-memory rowset every 60 seconds. | Historical rollback deletes all four; new Phase-B migration will delete only the exact switch row. | Boot prefetch starts one shared refresher. | Retain three knobs; retire switch in Phase B only. |
| Switch decision | `readSidedSwitch()` converts exact 0/1; `readCryptoLevelBuildKnobs()` exposes `.sidedEnabled`. | One active birth branch and one boot log field; shadows receive the field but never inspect it. | None. | Source deletion only. | Active build invokes it per crypto birth. | Delete reader, field, branch, and log field in Phase A. |
| OFF branch state | Writes `metadata.levelGeometry='mid'` only when the stamp is absent. | Every shared geometry reader can decode it; current open gate accepts recognized `mid`. | HYBRID can later rebase/re-stamp under ON. | No row deletion; stamp persists through RTB/position/history. | Active birth seam. | Delete writer; keep shared readers; reject active crypto `mid` at open. |
| Sided birth state | Writes `levelGeometry='sided'` and `levelBasisAtBirth` with bid/ask, plan, source, age, drift and stop distance. | Maker entry, RR floor, Net Expectancy, RTB refresh/ranking, fill economics, open gate, reports/history. | HYBRID idempotently retains an already-sided triple. | None. | Active birth seam. | Retain unchanged and make unconditional. |
| Geometry stamp through hops | Signal constructor; HYBRID carry-forward; RTB JSON persistence; active-position and closed-trade persistence. | `levelGeometryOf`, `levelGeometryStampOf`, maker/expectancy/fill readers. | RTB refresh changes market decisions but preserves the birth stamp. | Queue lifecycle deletes served/expired RTB rows; position close moves the durable record. | Existing RTB refresh/open lifecycle. | Re-prove; no schema/backfill. |
| P7 funnel | Seven production `recordTouchSelection` call sites update in-memory counters; one writer serializes whole snapshots. | One route reader plus file readers/operators; no client parser. | Counters are process-lifetime cumulative and reset on restart. | No live deleter; file retention is external. | One boot timer. | Retain; update governance only. |

### Per-lane geometry readers

- **Active crypto:** all new births must be sided. Signal Orchestrator S1/S2/S3, RTB S4/S5, the active open S6, and fill economics S7 continue to read the stored stamp; the open boundary adds the exact-sided requirement.
- **xStock:** keeps absent/unset stamp and therefore truthful midpoint geometry in the shared reader. The current control population had 14 active, 7 queued, 185 VTS-open, and 299 post-flip closed xStock rows, all with absent geometry stamps at the stated read times.
- **VTS:** crypto VTS is a separate telemetry lane, not the active pipeline. Its 33 open rows on 26 symbols had absent geometry stamps; it retains midpoint interpretation.
- **History:** stored `mid` rows are not rewritten. Reports must continue to decode the record that was actually traded.

## 5. Deletion-time state-write census

Deleting the OFF branch removes one writer of `metadata.levelGeometry='mid'`; its readers cannot be deleted because they serve xStock, VTS, and history. Therefore the safe post-delete invariant is lane-specific: `mid` remains a valid stored geometry generally, but it is invalid at a current active-crypto open boundary.

Deleting the switch reader removes no durable state writer. It does change four consumers of one shared object: active birth, active shadow, VTS shadow, and boot. All four must move together to a three-knob object; leaving even a shadow consumer on the old object causes silent shadow skips after deletion, and leaving boot on it prevents restart.

Deleting the database row changes the cached module rowset. The module refresher is a surviving mutator, so the removal must assume a successful refresh can expose the new three-row state to the running process within 60 seconds. The new migration is the sole active deleter and must guard the exact pre-state before deletion and exact post-state after deletion.

## 6. Provenance and original intent

### 6.1 Always-sided mechanism

Commit `1e83a320bfbfafa4177295c859787f71623d0a5e` introduced the post-strategy crypto birth rebase. Its stated intent was to build actionable levels on transactable sides, fail closed without a usable quote/stamp, and avoid midpoint fallback. This duty remains current and is the behavior Phase A makes unconditional.

### 6.2 Temporary dark-launch switch

Commit `2991b37352ec9dbaa1de26846c5ac043d57fa6ad` added the default-OFF switch because 8c shared another deployment before Kyle's live decision. It did not define a continuing product capability. KD-91 later authorized the live flip, and the row has been `1` since 2026-11-16T09:45:01.351822Z.

### 6.3 Birth-bound state

Commit `3aaae48de6858dbd54bc03f8bc92948f769ffc73` made the geometry decision birth-bound: OFF stamped `mid`, ON stamped `sided`, and later jobs read the row's own stamp rather than the live switch. The birth-bound contract remains; only the ability of a new active crypto birth to select `mid` is retired.

### 6.4 Removal authority

Commit `34fec1121b8127fc987ab85c837cf31e366169e7` recorded the first-week outcome as **NO-RESULT, not PASS**. Coltrane independently reproduced the 67/67 sided observed opens and ruled that no repeat window was required before OFF removal because the registered stop trigger did not fire and the operational hold was discharged. This authorizes removal of the temporary switch; it does not create a performance claim.

### 6.5 Canonical and governance record

The pre-governance canonical corpus was consulted and contains no switch, geometry-stamp, or 8c-specific sided-birth design. Its generic RTB intent remains compatible but is not current-state evidence. The System Manual and System Impact Map are likewise silent or stale on the post-2026 8c rebase; Step 10 must bring them forward.

## 7. Live evidence

### 7.1 Database and transition population

Read through `dt-sql` as `dt_reader`:

- At 2026-11-24T16:01:55Z, the exact four `level_basis` rows and values were present under the expected dimensions.
- At 2026-11-24T16:02:20Z, 6/6 active crypto positions and 87/87 post-flip closed crypto paper rows were `sided`; zero were `mid`, absent, or other.
- At 2026-11-24T16:02:31Z, the RTB table held 7 rows as a positive control and zero crypto rows; active positions held 20 rows as a positive control and zero active-crypto `mid` or absent stamps.
- The xStock/VTS controls above prove the same queries can find unstamped rows in lanes where that state is expected.

**Decision:** there is no live transition population that needs a temporary active-crypto `mid` tolerance. Exact `mid` at a current crypto open is refused; durable history is untouched.

### 7.2 Runtime and P7

At the audit read, staging ran exact source/build `e3a96a8126f0280a9568bb1823b9210783f0afe0`, process 2822823, restart count 715, online since 2026-11-24T00:02:58Z. The deploy record names the same ref and a 2026-11-24T00:03:08Z completed deploy.

The dedicated funnel file held 1,578 snapshots. Its latest two snapshots at 15:33:06Z and 15:48:07Z named the same build/process/lifetime and showed increasing counters, proving the P7 writer has a current independent duty. Current error-log counts for both the sided-RR tag and geometry-absent tag were zero; those zeros are not used as absence evidence because the live DB controls are the discriminating reads.

### 7.3 UI

The signed-in Paper Trading Open Trades view showed 19 engine/UI trades and 5 crypto rows at the UI read, with entry/current/target/stop values visible. The Ready to Buy view showed 9 xStock rows and zero crypto rows, matching the lane direction of the database read at that moment. The UI exposes no geometry or birth-basis stamp, so it can validate visible levels and open/queue continuity but cannot prove sided-versus-mid identity; exact cutover proof must come from database/API evidence.

## 8. The load-bearing cutover mechanism

The installed and repository deployer blobs matched at the audit read. Its fixed order is: reset exact target, build, run migrations, optional pre-restart task, then restart (`dt-deploy.sh:332-363`). The old process continues to run during the migration.

The old shared reader requires the switch row and throws when it is missing (`level-build-config.ts:47-60`). Active birth catches that throw and refuses the signal as unreadable knobs (`signal-orchestrator.ts:638-640`). The module cache successfully refreshes every 60 seconds and atomically replaces the cached rowset (`module-constants-service.ts:343-365,508-529`). The original rollback already warns that deleting the rows under a live reader causes a total crypto-entry blackout within one refresh and the next boot fails.

Therefore a same-ref migration plus reader deletion is unsafe under the current deployer even if the race is often too short to observe. Phase A must be live before Phase B's migration begins.

### Exact Phase-A → Phase-B precondition

Before Phase B, a committed verifier plus read-only database census must prove all of the following:

1. live checkout, build marker, deploy record, and running process all name the exact reviewed Phase-A SHA;
2. Phase A contains zero switch-row readers/branches and all active, shadow, and boot consumers use the three-knob contract;
3. the database still has the exact four-row pre-state, with switch value `1` and the three retained values/dimensions unchanged;
4. a deliberately wrong expected Phase-A SHA is rejected by the verifier; and
5. no open deploy window is silently crossed—the normal deploy census is still run and every window named.

The verifier is a release gate, not a long-running helper. It is archived/deleted at batch close after its evidence is recorded.

## 9. Exact fossil and literal policy

At the pushed batch HEAD before this document (`0a8115cb81b60576b113d21a265b3185098aefb4`), the exact retired switch literal appears on 31 lines in 14 files. The origin code ref alone has 27 lines in 13 files; the four-line difference is the approved off-removal scope. Production capability is confined to two source files plus one switch-only test: `level-build-config.ts`, `signal-orchestrator.ts`, and `b8c-switch.test.ts`. Those production/test occurrences must disappear.

The final exact-literal allowlist is frozen to these non-executable records only:

1. `drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql`
2. `drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs-rollback.sql`
3. `1-system-manual/RUNNING_ISSUES.md`
4. `1-system-manual/pm/DECISIONS.md`
5. `1-system-manual/pm/slot-checks/20261120T031720Z_CC-C_xstock-atr-record-gap-the-xstock-path-co.md`
6. `1-system-manual/pm/slot-checks/20261122T105459Z_CC-C_b-db-regime-enum-align-bring-the-databas.md`
7. `Claude Comms and Packages/Change Lists/B_PRICE_SIDE_BY_JOB_8C_CHANGE_LIST.md`
8. `Claude Comms and Packages/Scope Files/B_PRICE_FEED_COVERAGE_PRE_AUDIT.md`
9. `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md`
10. `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_SCOPE.md`
11. `Claude Comms and Packages/Scope Files/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_PRE_AUDIT.md`
12. `Claude Comms and Packages/Scope Files/B_RTB_PROMOTION_RETRY_STORM_SCOPE.md`
13. `1-system-manual/_archive/deleted-code/b-price-side-by-job-8c-off-removal/crypto-birth-sided-switch-2026-11-24.md`
14. `1-system-manual/DELETED_COMPONENTS_LOG.md`
15. `Claude Comms and Packages/Change Lists/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_CHANGE_LIST.md`
16. `Claude Comms and Packages/Batch Completion/B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_COMPLETION_REPORT.md`

The new Phase-B migration will not repeat the retired literal contiguously in source; it will build the guarded name from separately reviewed tokens so the immutable historical migrations remain the only executable SQL fossils containing the exact text. The source fence test will likewise compose the search term, so the test does not allowlist itself. Any exact occurrence outside the 16 paths fails CI; positive controls require every allowlisted path that exists at the graded ref to be found.

## 10. Audit aids and blind spots

### 10.1 Aid results

- `code-refs.mjs readSidedSwitch --file level-build-config.ts`: two symbol references in one file (definition plus one call). It cannot prove callers reached through the returned object or string-keyed database access.
- `code-refs.mjs levelGeometryOf`: 21 references, 20 uses, seven files. It locates readers but does not classify their lane meaning.
- `census.mjs --symbol readSidedSwitch`: one type-aware use in its declaring file; boot reach found through server index; zero recognized entry points. Its output cannot see raw SQL, string-keyed or computed imports, JavaScript/shell/Python/system services, TypeScript outside the configured programs, host-only schedules, or nonstandard entry points.
- `census.mjs --symbol readCryptoLevelBuildKnobs`: 12 type-aware uses across four files; three production files reached, one test not reached. It found boot, Signal Orchestrator, and VTS Runner consumers.
- `census.mjs --table module_constants`: 27 type-aware uses across five files and 373 raw-SQL text lines (183 keyword lines). This is the real table confirmed from its schema/write site, but the table-wide result cannot decide the narrower `level_basis` duty.
- `history.mjs level-build-config.ts --ref origin/migration/aws-supabase`: three B-PRICE-SIDE history leads. It cannot establish runtime reach or decide whether a cited batch record is current.

The two code-reference runs emitted the same unresolved-surface warning: `raw SQL strings`, `string-keyed access`, `dynamic import() with a computed path`, all JavaScript/shell/Python/systemd files, and TypeScript outside the configured programs are not resolved. Each of the three census runs emitted `cannot see:` with those same classes plus HTTP-string reach, host-only systemd/cron, and entry points outside its recognized `.start`/interval/cron patterns. The history run emitted `not covered:` for commit-body-only batch IDs, prose-only issue citations, pre-path history, phase-scoped IDs, duplicate basenames, and multi-hop renames. These are quoted limitations, not evidence of absence.

### 10.2 Eight named blind-spot classes

1. **Lists/value lists:** manually compared the three retained names/values, the retired fourth name, both migrations, the live database, and the proposed final exact-set contract.
2. **Literal copies:** manually ran the exact retired-literal census and froze the 16-path allowlist; tests must kill an extra source or documentation occurrence.
3. **Properties/fields:** manually searched `.sidedEnabled`; exactly one active decision and one boot-log read exist, while two shadows receive but do not inspect the field.
4. **Sibling producers:** manually enumerated active crypto constructors and found one post-strategy birth seam; xStock and VTS are separate control lanes, not sibling active-crypto producers.
5. **Meaning:** manually classified every geometry reader by active crypto, xStock, VTS, or history. Default-to-mid is intentional only outside new active-crypto birth/open.
6. **Error paths:** manually read missing/bad knobs, quote refusal, open refusal, cache-refresh failure, boot failure, and deploy ordering. Phase tests must exercise both accepted and rejected arms.
7. **Library behavior:** manually inspected the sanctioned deployer's migration-before-restart order, the module cache's swap-on-success refresh, and the migration ledger pattern; no inference from library names.
8. **Files outside TypeScript programs:** manually searched migrations, deploy shell, governance records, archived code, and analysis helpers. The census tool does not state its `scripts/` exclusion, so this manual line is the record.

## 11. Findings → implementation plan

### P1 — Phase A: remove the live switch dependency

**Falls out of:** findings 1, 3, 4; §§3-5 and §8.

- Replace the four-field knob object with the three retained numeric knobs.
- Delete `readSidedSwitch`, `.sidedEnabled`, the OFF branch, and switch-only boot logging/comments.
- Route active birth, active shadow, VTS shadow, and boot through the same three-knob reader.
- Keep `baseCryptoLevelsAtBirth` unchanged and call it unconditionally for active crypto; all existing quote/stamp/rebase refusals remain fail-closed.
- Do not add a database migration to Phase A. The switch row remains present and inert.

### P2 — exact-sided active-open boundary

**Falls out of:** findings 2 and 3; §§4-5 and §7.1.

- Change the active crypto open guard from “stamp is absent” to “stamp is not exact `sided`.”
- Use a truthful refusal name for both `mid` and absent/malformed cases; preserve the actual observed stamp in evidence.
- Keep shared `levelGeometryOf` behavior unchanged for xStock, VTS, and history.
- Add real-engine tests for `sided` acceptance and `mid`/absent/malformed refusal before the EV gate.

### P3 — Phase-A source, hop, and mutation fences

**Falls out of:** §§4-5, §9, and §10.

- Replace switch-only tests with always-sided birth wiring and hop tests: strategy → HYBRID → RTB JSON → promotion/open.
- Mutants must restore an OFF branch, emit `mid`, drop the stamp, leave one shadow on the old object, or tolerate active-crypto `mid`; each must fail.
- Retain positive controls proving xStock/VTS midpoint fixtures and historical-mid decoding still pass.
- Add the exact literal allowlist fence with positive controls; compose the retired term inside the test.

### P4 — recoverable deletion record

**Falls out of:** scope OBJ-5, §6, and §9.

- Archive the removed switch reader/field/OFF-branch/test fragments at the exact frozen archive path.
- Add the `DELETED_COMPONENTS_LOG` row naming the original dark-launch duty, KD-91/NO-RESULT discharge, Phase-A and Phase-B refs, and recovery path.
- Do not archive or delete P7, the shared geometry helpers, or the immutable original migrations.

### P5 — two-ref review and CI package

**Falls out of:** §8.

- Step 3 produces two immutable commits/refs: **A** (all code/test/archive/fence work except row deletion and strict post-delete contract) and **B** (A plus guarded delete migration and exact-three runtime contract).
- Step 4 asks Coltrane to review both exact refs and the forced order, not only the combined diff.
- Step 5 requires all four CI jobs green at both exact refs and unchanged reviewed blobs.
- Neither ref may be rebased or amended after its exact review without a new review/CI identity.

### P6 — Phase-A deployment and immediate proof

**Falls out of:** P1-P3 and §8.

- Deploy exact A through `dt-deploy`, naming every then-open window.
- Prove checkout/build/deploy/process identity = A; database still exact four rows; all live readers use the three-knob contract; app starts; crypto birth tests and live refusal/traffic controls remain normal.
- Run the committed cutover verifier with correct A (pass) and a wrong A (refuse). Record its output, then perform the read-only four-row census.

### P7 — Phase-B guarded migration and strict contract

**Falls out of:** §§7.1, 8, and the fresh-reader hit.

- Migration precondition: exactly four total `level_basis/crypto_spot` rows; exact names/values/dimensions; switch exactly `1`; no extra rows under other dimensions.
- Delete only the exact switch row.
- Migration postcondition: exactly three total rows; each retained name/value/dimension exactly once; switch absent; no extra rows.
- Runtime boot contract independently asserts the same exact-three set after prefetch; it must detect a fourth unexpected row, a wrong dimension/value, or the retired row.
- Recovery returns to Phase A, not to OFF: restore Phase-A code before reinserting the exact switch-on row. The procedure must state the restart implications and be mutation-tested.

### P8 — Phase-B deployment and immediate proof

**Falls out of:** P6-P7.

- Only after A proof, deploy exact B through `dt-deploy`. Because A is the running process during B's migration and has zero switch dependency, migration-before-restart is safe.
- Prove 4→3, retained values/dimensions/update metadata unchanged, retired row absent, no extras, checkout/build/deploy/process identity = B, and app boot under the strict contract.
- Prove active crypto remains sided-only through deterministic real-engine tests plus live DB/API evidence. If no natural crypto opportunity exists, report “not naturally exercised,” never PASS from zero.

### P9 — Step-10 governance and closeout

**Falls out of:** §§2, 6.5, 7.3, and 9.

- Update the System Manual with the permanent active-crypto sided birth and shared midpoint exception.
- Update the System Impact Map with the birth seam, stamp/open boundary, retained P7 writer, and three-row module.
- Update `BATCH_CATALOG`, `PHASE_HISTORY`, `RUNNING_ISSUES` cross-references as applicable, `DELETED_COMPONENTS_LOG`, the off-removal change list, and the completion report.
- Record the UI limitation: Paper Trading shows levels but not the geometry stamp, so exact proof is database/API based.
- Archive/delete the transient cutover verifier after its evidence is durable and prove no live caller remains.

No plan item is `UNAUDITED`.

## 12. Verification matrix

| objective | deterministic proof | live proof | red control |
|---|---|---|---|
| Always-sided active birth | Real-engine birth/hop suite; source census zero switch branch. | Current/post-deploy crypto rows exact `sided`. | Mutant restores OFF or emits `mid`. |
| Shared midpoint preserved | xStock/VTS/history unit fixtures. | xStock/VTS control populations remain unstamped/mid-decoded. | Mutant deletes or aliases the shared mid arm. |
| Safe cutover | A/B exact refs; verifier; migration pre/post assertions. | Live A before B; live B after exact 4→3. | Wrong A refused; extra fourth row and wrong dimensions rejected. |
| Open boundary | Engine test orders refusal before EV gate. | Zero current transition rows plus post-deploy stamp census. | `mid`, absent, malformed each refused. |
| P7 retained | Writer/start tests and source census. | Snapshot count advances under correct build/process. | Duplicate scheduler or stopped writer fails. |
| No dormant capability | Exact literal/path fence and code-reference census. | Database switch absent only after B. | Extra literal/current four-row assumption fails. |

## 13. Observation-window disposition

No new `DEPLOY_WINDOWS` row is filed. This batch removes a dormant OFF branch from behavior that has already been live since KD-91; every acceptance gate is immediate and deterministic. Both deployments still run the ordinary live window census and name every open/stale window they cross.

## 14. Fresh-reader record

`REVIEWER: claim-only · current deploy ordering plus 60-second cache refresh can expose a same-ref row deletion to the old live process; name settling objects and other consistent states · HIT: two refs are required under the current migration-before-restart chain; all four consumers must move in A; final exact-three predicate must assert total cardinality and explicit absence, not merely count matching rows · re-derived y`

The hit was re-derived at exact origin ref `40d06d366...` from `dt-deploy.sh:332-363`, `module-constants-service.ts:343-365,457-474,508-529`, `level-build-config.ts:47-85`, both shadows, boot wiring, the original seed predicate, rollback warning, and switch tests. The plan incorporates the two refinements in P1 and P7. The reader's clean areas are not cited as evidence.

## 15. Plain-language summary

The audit found that the switch is genuinely temporary and the live active-crypto path no longer needs an OFF choice, but the database row cannot safely be removed in the same deployment that removes its reader. The deploy tool changes the database before it replaces the running app, so the safe plan is two short, reviewed releases: first make the running app ignore the row and prove it, then delete the row and prove the exact three controls remain.

This does not create another multi-day wait. xStock, VTS, historical midpoint records, and the P7 funnel all stay intact; only new active crypto becomes permanently sided, and a stale midpoint-stamped crypto row is refused rather than silently reinterpreted.

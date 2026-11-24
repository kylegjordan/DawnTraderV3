# B-PRICE-SIDE-BY-JOB `8c-OFF-REMOVAL` — SCOPE (Step 1) — r1

change-class: sub_batch

> **Step-1 r1 review — CHANGES NEEDED, corrected in r2.** Coltrane accepted the authorization boundary, NO-RESULT/no-stop-trigger record, shared-mid preservation, transition census and code-first/database-second cutover at exact ref `0260d89d2587848daf7d6ecdc2ce9a49e1533a5c`. He found one contradiction in OBJ-5: a zero-literal criterion could not coexist with immutable historical migrations and a required recovery archive. R2 names those non-executable fossils explicitly and makes the fence reject only occurrences outside that allowlist. No implementation is authorised by this correction.

**Owner:** ANALYST Codex (standing in for ANALYST Claude / CC-C) · **Parent:** `B-PRICE-SIDE-BY-JOB`, plan row 17 / item `8c` · **Authority:** the pre-placed §13 switch-removal duty, after the registered switch-on read · **Current reviewed evidence:** `34fec1121b8127fc987ab85c837cf31e366169e7`.

## 0. What this sub-batch is for

Crypto level construction has been permanently switched from midpoint-derived levels to the transactable sides: entry on the ask, a resting maker on the bid, and stop/target rebased for an exit on the bid. The temporary `level_basis.crypto_birth_sided_enabled` flag existed so that this code could deploy dark before Kyle authorised the live flip. It was switched on 2026-11-16 under KD-91 and the registered first-week read found 67 of 67 observed crypto paper opens sided; the literal window verdict was **NO-RESULT, not PASS**, because one day's admitted-symbol supply fell below its floor, but the registered under-10 stop condition did not fire. Coltrane therefore discharged the operational hold and ruled that no repeat window is required before this removal.

This sub-batch removes that temporary OFF capability. It makes the active crypto birth seam unconditionally sided, removes the switch row and reader only after no running old code can still read it, and prevents a new active crypto signal from using the historic midpoint cost arm. It does **not** remove midpoint geometry from shared economics: xStock and VTS still need that arm, and historical rows must remain readable as the records they actually were.

## 1. Objectives and proof criteria

| # | objective | verification drafted now; filled at Step 7 |
|---|---|---|
| **OBJ-1 — crypto birth is always sided** | Remove the `sidedEnabled` decision and the OFF branch at the one active crypto birth seam. Every newly built `crypto_spot` active signal must either leave with a valid `levelGeometry='sided'` plus its exact `levelBasisAtBirth`, or be refused at that seam. No quote, bad/missing stamps, unreadable level-build knobs, stale/implausible sides, or an inconsistent rebase must still fail closed; there is no midpoint fallback. | Source/compile fence proves one active crypto birth seam and zero switch reads/branches. Real-engine tests prove a valid quote yields the same sided entry/stop/target/maker record as before removal. Mutants that restore an OFF branch, emit `mid`, or allow an unstamped crypto row fail. |
| **OBJ-2 — remove midpoint as an active-crypto choice, preserve it everywhere it is truthful** | Downstream active-crypto ranking, maker/taker, open and fill decisions must receive sided geometry by construction. Shared `computeNetGeometry`, `evaluateTradeExpectancy`, `decideMakerTaker` and `computeFillEconomics` retain their required `'mid' | 'sided'` contract because xStock, VTS and historical records still use midpoint geometry. Existing durable rows are never rewritten from `mid` to `sided`, and reports/history continue to decode their stored stamp honestly. | Call-site census classifies every geometry reader by lane and proves every active-crypto constructor is sided-only while named xStock/VTS controls still execute the mid arm. A crypto-mid mutation at a current active seam is refused; xStock/VTS mid fixtures and a historical-mid decode control pass unchanged. |
| **OBJ-3 — retire the database switch without an unsafe cutover gap** | Delete only `module_constants` row `level_basis.crypto_birth_sided_enabled`. Retain the three active build controls (`level_build_max_age_ms`, `level_build_max_spread_fraction`, `level_build_drift_ref_60s`) with the same values and fail-closed boot/runtime validation. The switch row may not be removed while any running old build can refresh its cache and read it. Step 2 must freeze an exact safe sequence—normally code that no longer reads the row first, proven live, then the row deletion—and must reject a migration/deploy order that creates even a short all-crypto refusal window. | Pre/post exact-key database census is 4→3 with all three retained rows byte/value-equal and zero duplicate/wildcard impostors. A live-build identity and process census proves the row deletion occurred only after every running process used code with zero readers. A wrong-order deployment fixture or dry-run is rejected. |
| **OBJ-4 — keep birth-stamp and hop safety** | Preserve `levelSpec`, `levelGeometry` and `levelBasisAtBirth` through HYBRID rebuilding, RTB persistence/refresh, JSON round-trip and promotion. Preserve the open refusal for a crypto signal whose geometry stamp is absent or malformed. Decide at Step 2 whether an exact legacy `mid` stamp at a live crypto open is refused or tolerated only for a proven transition population; the answer must come from a current queue/open-position census, not an assumption. | Hop tests cover builder → HYBRID → RTB write/reload → promotion/open. Pre-deploy staging census enumerates all current crypto RTB and active-position stamps with a positive control. The chosen legacy-mid disposition has a red mutation and no silent reinterpretation. |
| **OBJ-5 — remove the obsolete switch machinery completely and recoverably** | Remove switch-only source, tests, comments and current migration assumptions; replace broad “exactly four rows” runtime assertions with the exact three-row live contract. Archive the deleted source fragment under `_archive/deleted-code/` and add one `DELETED_COMPONENTS_LOG.md` row naming why the code existed, the evidence that discharged it, the deletion ref and recovery path. No switch-shaped dormant compatibility layer remains. | Production-capability census returns zero switch readers/branches. Exact-literal search returns only the explicit non-executable allowlist: the immutable 2026-11-08 forward and rollback migrations, the recovery archive fragment, and named scope/change/deletion/governance records. CI rejects any occurrence outside that allowlist and rejects a current four-row assertion. Positive controls find every allowlisted fossil, the three retained `level_basis` readers and the shared mid geometry arm. |
| **OBJ-6 — deploy and prove the removal without creating a new observation hold** | Deploy through the ordinary reviewed workflow, name all open windows, preserve unrelated process/deploy state, and verify the active crypto seam still produces or refuses signals for the same sided reasons after cutover. This is removal of a live-ON switch, not a new trading-policy experiment: no new multi-day grade is created unless Step 2 finds a distinct behavioural change. | CI 4/4 per job; reviewed deploy/cutover record; exact post-deploy build and process identity; the three-row DB census; current-sided birth/open evidence or, if natural opportunity is absent, the deterministic real-engine proof plus live refusal/instrument positive controls. No result is called PASS from an empty natural population. |

### Not in this sub-batch

- No change to the price clocks, the source or age ceiling of crypto sides, the level rebase formula, grid rounding, RR floor, fill policy, fees, slippage values, or the exit trigger/booking path.
- No deletion of `'mid'` from the shared `LevelGeometry` type or shared economics functions; xStock/VTS/historical consumers retain it.
- No rewrite or backfill of stored `levelGeometry`, `levelBasisAtBirth`, trade levels or outcomes.
- No repair of the known midpoint-arm cost overlap (`#1252`) or break-even spread issue (`#1253`). Those are separately homed and cannot be smuggled into a switch deletion.
- No new calibration epoch or learning-record reset: always-sided crypto has been live since the KD-91 flip; this removes a dormant rollback branch without changing the live policy.
- No claim that the registered first-week read passed. Its verdict remains **NO-RESULT / no stop trigger / operational hold discharged**.

## 2. Architectural read

### System Manual — price provenance and level basis

The System Manual's “WHICH PRICE DOES WHICH JOB” and “LEVEL BASIS” sections distinguish a value estimate from a transactable price. A midpoint may estimate value, but a level that can trade must use the side for that leg. The crypto quant lane starts from a smoothed ticker midpoint for its strategy decision, then 8c rebases the actionable triple at the single post-strategy birth seam from a fresh transactable quote. The order book and ticker are not interchangeable; level construction uses the top-of-book sides and fails closed under the `level_basis` age/spread controls.

The same manual states that net execution geometry is shared by Signal Orchestrator, RTB Refresh, Dynamic Sizing, SQE, TEC and VTS. That shared surface is why the generic mid arm cannot be deleted. The safe cut is lane-specific: active crypto becomes sided-only at its constructor and hop boundaries; shared consumers keep both truthful geometries.

### System Impact Map — state and blast radius

The System Impact Map records the crypto quant level-basis state (`filterRegistry`, S26) as in-memory, restart-discontinuous and upstream of every derived level. This sub-batch does not alter that state or its clock. It also records the wider `B-PRICE-SIDE-BY-JOB` side/size contracts as shared market-data shape. The touched switch is narrower: one DB constant, one synchronous knob reader, one active-crypto birth branch, and downstream interpretation of a persisted stamp.

Blast radius is still high because the birth seam feeds sizing/economics, RTB ranking and the active open. The controls are therefore positional rather than statistical: one constructor, required stamp, fail-closed hop/open checks, exact lane census at every geometry reader, and a cutover that cannot expose old code to a deleted row.

### Current caller/dependency map (scope-time; Step 2 must compile-drive and freeze it)

- **Writer/decision:** `server/services/signal-orchestrator.ts` is the sole `.sidedEnabled` consumer and the sole active crypto birth rebase seam.
- **DB reader/boot:** `server/core/trading/level-build-config.ts` reads four rows today; `server/startup/b72-warmup.ts` asserts and logs them.
- **Stamp source/readers:** `server/core/trading/crypto-birth-levels.ts` writes and interprets `levelGeometry` / `levelBasisAtBirth`; RTB and the engine carry/read the stamp.
- **Shared economics:** `server/core/math/cost-model.ts`, `server/core/calculations/expectancy.ts`, `server/core/trading/fill-economics.ts`, `server/core/rtb/ready_to_buy_service.ts`, `server/services/fill-econ-inputs.ts`, and `server/services/active-execution-engine.ts` must keep the generic mid arm for non-active-crypto lanes.
- **Database:** `drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql` introduced the four-row module. Removal needs a new forward migration; the historical migration remains immutable.

## 3. Provenance read and disposition

### Corpora searched

Searched by the symbols `crypto_birth_sided_enabled`, `readSidedSwitch`, `sidedEnabled`, `levelGeometryOf`, `levelGeometryStampOf` and `baseCryptoLevelsAtBirth` across `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the 8c audit/plan and change list, batch completion records, System Manual, System Impact Map, current source/tests/migrations, and repository history. `git log -S` leads were checked against the named commits and their full messages; the current objects were re-opened before this scope was drafted.

### Tier 1 — behaviour this sub-batch changes

**Sided birth levels.** Commit `1e83a320bfbfafa4177295c859787f71623d0a5e` says verbatim:

> “B-PRICE-SIDE-BY-JOB 8c Step-3: crypto levels on the transactable sides at birth, per stamped form (S1 + P3 + P7 + section 5 ship path)”

Its message further states verbatim that the seam is “after the funnel denominator and before the venue grid” and that “no quote, absent/malformed/inconsistent stamp, or an unreadable knob REFUSES (no mid fallback).” **Disposition: (1) still relevant and correct.** The always-sided constructor and fail-closed behaviour remain.

**Temporary switch.** Commit `2991b37352ec9dbaa1de26846c5ac043d57fa6ad` says verbatim:

> “B-PRICE-SIDE-BY-JOB 8c Step-3: the switch-on behind level_basis.crypto_birth_sided_enabled, seeded 0 - 8c deploys inert, turned on by one DB flip after Kyle's section 6(b) report”

Its stated reason was that 8c shared OLD Claude's deploy range while the live flip still waited on Kyle. That reason has expired: Kyle authorised KD-91, the row has been 1 since 2026-11-16, and the operational hold is discharged. **Disposition: (5) disconnected and should stay disconnected / be deleted.** The named deletion is this sub-batch; source recovery is the exact introducing ref plus the required archive/ledger record.

**Birth-bound persistence.** Commit `3aaae48de6858dbd54bc03f8bc92948f769ffc73` says verbatim:

> “B-PRICE-SIDE-BY-JOB 8c Step-3: switch conditions (a)-(d) per Langston 00:33Z - the flip binds at birth (every crypto signal stamped 'sided' or 'mid'), the open refusal keys on the stamp not the live switch, the seventh strategy wire-in documented”

That commit also names `8c-OFF-REMOVAL` after the switch-on holds. The stamp-at-birth and hop/open discipline remain correct; only the ability for a *new active crypto* birth to choose `mid` is obsolete. **Disposition: mixed by component:** stamp/hop/open contract = **(1)**; OFF birth arm and switch reader = **(5)**.

**Operational evidence.** Commit `34fec1121b8127fc987ab85c837cf31e366169e7` says verbatim:

> “B-PRICE-SIDE-BY-JOB 8c: record registered first-week NO-RESULT”

It records 67 crypto paper opens on 34 symbols, all 67 sided, with zero in the active-position anti-join. Supply fell below the literal floor on one day, so this is not a statistical pass. Coltrane nevertheless ruled no repeat window was required before OFF removal because the stop trigger did not fire and the switch's operational hold—not a performance hypothesis—was the removal gate. This evidence authorises the planned deletion; it does not authorise changing the sided policy.

### Tier 2 — read/call-only components

- `computeNetGeometry`, `evaluateTradeExpectancy`, `decideMakerTaker` and `computeFillEconomics`: intended to price the geometry named by their required argument. Retain both arms; change only which arm the active-crypto lane can supply.
- RTB metadata persistence and HYBRID `pickLevelStamps`: intended to preserve the birth decision across queue/refresh/rebuild. Retain unchanged and re-prove.
- `level_build_max_age_ms`, `level_build_max_spread_fraction`, `level_build_drift_ref_60s`: intended to govern whether the transactable basis is usable and to stamp its drift context. Retain unchanged.
- P7 funnel writer: intended to observe birth/refusal flow, not choose geometry. Retain unless Step 2 proves its only remaining duty was the completed switch window; any removal requires its own explicit disposition, not inference from the switch.

## 4. Initial implementation boundary for Step 2

Step 2 must produce an exact caller/callee and lane ledger before code changes. In particular it must settle:

1. the safe code-first/database-second cutover sequence against `dt-deploy`'s real migration/restart order;
2. every current active-crypto path that can create or reinterpret `levelGeometry`;
3. the live transition population (`rtb_signals`, active positions and any durable pending-maker state) before deciding how an exact legacy `mid` stamp behaves at open;
4. whether the P7 funnel has a surviving non-switch duty; and
5. the exact test/archive/governance files that replace the switch-only tests and four-row assertions.

No code, migration, deploy, row deletion or observation criterion is authorised by this scope alone.

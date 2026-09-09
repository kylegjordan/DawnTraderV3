# DawnTrader full-system audit

**Audited source:** `C:\DawnTrader-Audit`  
**Audit date:** 2026-09-05  
**Required commit:** `5a7fc2eccef6c8d30b35006f3c27c53fb4d21da1`

## Header check — literal command results

Command: `git rev-parse HEAD`

```text
5a7fc2eccef6c8d30b35006f3c27c53fb4d21da1
```

Command: `git status --porcelain`

```text
[no stdout]
warning: unable to access 'C:\Users\kyleg/.config/git/ignore': Permission denied
```

The commit is an exact match and the audited worktree is clean. The warning is about the user-level ignore file; it does not report a worktree change.

## Protocol qualification

The user-supplied path `C:\DawnTrader-Codex\AUDIT\_BRIEF.md` did not exist. The only matching brief was `C:\DawnTrader-Codex\AUDIT_BRIEF.md`, which I used.

**Section 6 blind-spot gate was contaminated.** My first command displayed the entire brief, including text below its STOP marker, before I wrote the required question artifact. I created `C:\DawnTrader-Codex\notes\my-questions-before-section-6.md` immediately afterward, marked it contaminated, and preserved the reconstructed questions and delta. I do not claim that artifact is an uncontaminated pre-exposure measurement. This is a protocol deviation, not a source-code finding.

The crew mirror was also stale: its header said `GENERATED: 2026-09-04 20:48:05Z` and `LAST MESSAGE: 2026-09-04T20:44:07`. I treated it only as dated context, never as current operational truth.

## Positive read enumeration

Before the findings, these are the source families actually read. Exact files and whether each read was whole, selected, or search-only are recorded in the detailed coverage inventory near the end; output-truncated commands are not represented as whole-file reads.

- Workspace controls: `AUDIT_BRIEF.md`, the crew-mirror freshness header/recent excerpt, and the two audit note artifacts.
- Primary governance: `SYSTEM_MANUAL.md`, `SYSTEM_IMPACT_MAP.md`, `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `PHASE_19_PLAN.md`, and `POST_AUDIT_ROADMAP.md` (selected sections/search results except the brief).
- Schema/persistence: `shared/schema.ts`, `migrations/meta/0001_snapshot.json`, and the relevant `server/storage.ts` methods.
- RTB/event path: `ready_to_buy_service.ts`, `event-bus.ts`, `trading-bootstrap.ts`, plus targeted pipeline caller searches.
- Execution/math/config/state: `active-execution-engine.ts`, `active-position-sizing.ts`, `cost-model.ts`, `maker-taker-decision.ts`, `net-expectancy-kernel.ts`, `expectancy.ts`, `module-constants-service.ts`, `price-cache.ts`, and targeted callers in `server/index.ts`, the Kraken adapter, and the trailing-exit controller.
- History/provenance: the B79.0n RTB scope/completion record, B79.0m.a retrospective-index record, P19-B7.2 and B7.2c completion records, bounded searches across every completion report, and targeted Git log/blame/show history.

## Executive assessment

The most important newly established flaw is an incomplete asset-class migration in the Ready-to-Buy (RTB) queue. `asset_class` became a first-class partition in May, but the older identity operations still identify rows by mode/symbol/strategy (and, in the declared unique index, status) rather than by asset class. The event contract itself says same-symbol cross-class rows are structurally possible. This can make one asset class overwrite, reject, compare against, or clear another asset class's signal.

The same RTB surface also contains a self-contradictory persistence contract: the checked-in unique index is four-column, while the upsert names a three-column conflict target. The database must contain an unrepresented constraint or the upsert cannot match the declared schema. Either outcome is a reproducibility defect; a single database query in `QUESTIONS.md` distinguishes them.

The second material problem—paper/live mode parameters on `active_open_positions` methods without a mode column—is already found, accepted, and scheduled in the project record. It remains live at the audited commit and includes destructive reset paths, so it belongs in this audit, but it is not a new discovery.

A third issue is a bounded hypothesis: maker-entry EV credits the entire spread even though the paper maker limit is the signal entry and the manual describes the crypto quant basis as midpoint. Contemporaneous BBO-to-entry joins are required before calling this a defect.

## Findings, ordered by importance

### 1. RTB's asset-class partition is absent from row identity, and its declared uniqueness cannot support its upsert

**One-sentence flaw:** RTB stores and filters `asset_class`, yet uniqueness, conflict resolution, duplicate selection, and promotion cleanup still use pre-asset-class identities, allowing canonical same-symbol signals from different asset classes to alias; additionally, the declared four-column unique index does not match the three-column upsert conflict target.

**Disposition:** defect. The exact deployed-constraint branch remains runtime-dependent, but every possible branch leaves either an executable upsert failure or a repository/schema reconciliation failure.

**Instances at the audited commit:**

- `shared/schema.ts:2107-2111` declares `assetClass` as the per-class queue partition key.
- `shared/schema.ts:2142` declares the only RTB identity-like unique index as `(mode, symbol, strategy, status)`—no `assetClass`.
- `migrations/meta/0001_snapshot.json:15052-15078` records that same four-column unique index.
- `server/storage.ts:4329-4331` upserts with conflict target `(mode, symbol, strategy)`—no `status`, no `assetClass`.
- `server/storage.ts:4352-4356` then overwrites `assetClass` in the update set, so a matching pre-class identity can be reclassified by the later writer.
- `server/core/rtb/ready_to_buy_service.ts:1373-1380` finds one queued signal by `(mode, queued, symbol, strategy)` with no class predicate.
- `server/core/rtb/ready_to_buy_service.ts:2163-2208` uses that row as the incumbent for cross-signal R-multiple comparison and replacement; it may therefore compare two different underlying assets sharing a canonical symbol.
- `server/core/rtb/ready_to_buy_service.ts:519-524` receives a `PromotionEvent` but clears by symbol/mode only.
- `server/core/rtb/ready_to_buy_service.ts:572-584` selects the first queued row matching a symbol, with neither strategy nor asset class in the cleanup identity.
- `server/lib/event-bus.ts:57-66` explicitly documents that same-symbol-across-classes is structurally possible and supplies `assetClass` for consumers that need to disambiguate. The RTB cleanup consumer ignores it.
- `shared/schema.ts:1937-1944,2013` shows the same structural smell one stage later: `active_open_positions` carries asset class but is unique on symbol alone. `server/storage.ts:3726-3739` confirms that symbol-only constraint is the intended active-position dedup identity. This may be an intentional portfolio-wide pair-exclusivity rule, but it amplifies the RTB collision once a signal is promoted and should be explicitly decided rather than inherited from symbol spelling.

**Third-input/history result:** `git blame` shows the RTB `assetClass` field and write mapping were added together by `8dd10c7474` on 2026-05-27, while the unique index and conflict target remained from `a3d5c4f509` on 2026-03-19. `git show 8dd10c7474` confirms that batch added the column, filter index, dual-write, and event field but did not evolve the older identity. This establishes which side moved.

The B79.0n.RTB completion report calls per-class partitioning complete and says the event field exists for disambiguation. Separately, `BATCH_79_0m_a_COMPLETION_REPORT.md:87` explicitly requested a “retrospective audit” of other tables that gained `asset_class` without updating unique indexes. That requested audit trail did not result in an RTB issue entry.

**Face-of-finding provenance: NOT FOUND.** I found the general retrospective-audit candidate and adjacent collision work, but no issue or completion record naming RTB's missing asset-class identity or its 4-column-index/3-column-conflict mismatch. Exact searches were run over `1-system-manual/RUNNING_ISSUES.md`, `1-system-manual/BATCH_CATALOG.md`, and all files under `Claude Comms and Packages/Batch Completion` for:

```text
rtb_signals_symbol_strategy_idx
asset.class.{0,40}(unique|conflict|identity|dedup)
same.symbol.across.classes
same-symbol-across-classes
on conflict.{0,40}rtb
mode.symbol.strategy.status
mode.symbol.strategy
gained .asset_class.
didn.t update unique
unique index.*asset
asset.*unique index
retrospective audit
```

**What falsifies it:**

1. A documented, approved rule that canonical same-symbol cross-class signals are intentionally one identity at every RTB operation, plus evidence that the optional event class is intentionally ignored by cleanup; and
2. a deployed unique/exclusion constraint matching the three-column upsert target, together with a checked-in migration/schema representation that I missed.

The first would reclassify the class-aliasing portion as working-as-designed-needing-decision. The second would close the upsert-executability branch but leave repository reproducibility until the declaration is reconciled.

**Confidence:** high for the static identity mismatch; high for the schema/upsert contradiction; medium for realized production incidence. Confidence rises to very high with the two database queries in `QUESTIONS.md` and historical collision rows.

### 2. `active_open_positions` mode-scoped APIs do not scope by mode, including destructive resets

**One-sentence flaw:** storage APIs promise paper/live isolation, but the table has no paper/live discriminator and every shown method ignores its `mode` argument, so separate callers receive the same rows and reset endpoints can delete both modes.

**Disposition:** defect, already accepted and scheduled; do not file as novel.

**Instances at the audited commit:**

- `shared/schema.ts:1937-2015` defines `active_open_positions` with no paper/live column and a symbol-only unique constraint.
- `server/storage.ts:3749-3785` accepts `mode` in update/get/list/delete methods but never predicates on it; `deleteAllActiveOpenPositions(mode)` has no `WHERE` clause.
- `server/storage.ts:3788-3793` does the same for active trade logs and closed trades in the bulk reset family.
- `server/index.ts:1074-1075` requests paper and live positions separately, but both calls necessarily receive the same table population.
- `server/exchanges/kraken/kraken-websocket-adapter.ts:2652-2653` repeats that double read.
- `server/services/trailing-exit-controller.ts:666,675` repeats it again, creating a route by which the same positions can be processed under both requested modes.

**Face-of-finding provenance: FOUND-AND-LIVE.** `RUNNING_ISSUES.md:2449-2498` (#618) records the ignored-mode family and Kyle's decision to add/backfill a discriminator. `POST_AUDIT_ROADMAP.md:692-703` names `B-MODE-DELETE-SCOPE`, explicitly states that delete methods erase both modes, enumerates reachable reset routes, and gates the work on the discriminator column. `PHASE_19_PLAN.md:78` shows the remaining #618 work is still sequenced, not closed.

**What falsifies it:** a deployed `active_open_positions` mode column plus audited-commit-unrepresented predicates would reduce current operational exposure but would prove repository/deployment drift. At source level, only predicates or intentionally mode-free API contracts falsify the claim; neither exists at this commit.

**Confidence:** very high. Runtime schema inspection in `QUESTIONS.md` determines whether deployment has moved ahead of the audited repository.

### 3. HYPOTHESIS — maker-entry EV may credit half a spread more than the order placement can earn

**One-sentence pattern:** the maker/taker decision subtracts the full spread from maker friction, while the maker limit is the signal's entry price; for midpoint-based signals, resting at midpoint saves only the entry half-spread relative to an ask-side taker, not the full round-trip spread.

**Disposition:** working-as-designed needing an evidence-backed basis decision unless the runtime join confirms midpoint placement, in which case it is a defect in economic-cost application.

**Instances at the audited commit:**

- `server/core/math/cost-model.ts:163-177` defines round-trip taker friction as two fees, two slippage legs, and one full spread—the conventional half-spread per leg total.
- `server/core/math/maker-taker-decision.ts:215-242` constructs the taker leg with that full friction, then gives maker entry an advantage equal to fee delta + full spread + entry slippage.
- `server/services/active-execution-engine.ts:3810-3826` (line history traces this block to the former paper engine) rests the maker at `signal.entryPrice` and checks whether best ask is already through that limit.
- `SYSTEM_MANUAL.md:595-614` describes crypto quant entry basis as smoothed BBO midpoint and pattern basis as bar close. A midpoint limit is not a bid-side limit; a bar close has no invariant BBO side at all.

**Face-of-finding provenance: NOT FOUND for this exact entry-EV/basis join.** Searches over the required provenance corpora used:

```text
makerEntryAdvantagePct
maker.entry.advantage
half.spread
full.spread
spread.capture
maker limit.*entry
entryPrice.*maker
maker.*midpoint
maker.*mid
```

The search did find adjacent, later price-side issues—especially `RUNNING_ISSUES` #741/#952 concerning midpoint-based maker fill decisions—and records affirming that the generic taker friction formula itself is correct. Those do not settle whether the maker entry price sits at bid, midpoint, ask, or bar close when the full-spread advantage is awarded.

**What falsifies it:** a joined sample showing maker limit/entry sits at or below contemporaneous best bid for the affected lane, or a documented cost convention proving `entryPrice` already incorporates an ask-side adjustment while the resting limit deliberately captures the whole spread. The query/control is specified in `QUESTIONS.md`.

**Confidence:** medium-low as a defect; high that the code/manual contracts require a basis join that the current formula does not express. Runtime evidence would raise or close it.

## Unsettled items and evidence needed

1. The live RTB constraint set is decisive for whether every upsert is at risk or whether production has an undocumented three-column constraint. See Question 1.
2. Historical same-symbol cross-class RTB occupancy determines realized severity, not structural validity. See Question 2.
3. Maker entry's location within the contemporaneous spread must be measured by lane; averages across quant and pattern would hide the distinction. See Question 3.
4. The deployed `active_open_positions` schema may have advanced beyond this pinned commit. See Question 4.
5. The symbol-only uniqueness of active positions needs an explicit product decision separate from paper/live mode. A portfolio-wide “one canonical symbol across every asset class” cap could be intentional, but the event contract's collision warning and per-underlying exposure controls make implicit inheritance unsafe.

## Section 6 question delta

Because the pre-gate artifact was contaminated, this is a planning comparison only.

Section 6 added four useful emphases that my reconstructed questions did not isolate: semantic changes introduced by smoothing/clamping/defaulting; the explicit writer-without-reader versus reader-without-writer symmetry; duplicate work by separate mechanisms; and shared-mutable-state races.

My own list added seven emphases not explicit in Section 6: conserving one selection objective through the full pipeline; rechecking safety after rounding/price substitution/delayed execution; cold-start reachability plus recovery plus proof-of-execution; separating timestamp meanings; calibration-population representativeness; process/restart semantics; and dimensional checks for unit, sign, leg, anchor, and population.

The full preserved artifact is `C:\DawnTrader-Codex\notes\my-questions-before-section-6.md`.

## Coverage and positive read enumeration

The following are the paths actually read. “Selected” means line ranges, heading inventory, or search-returned excerpts—not a claim that every byte was displayed. Several large commands were output-truncated, and this list deliberately does not inflate those reads into whole-file coverage.

### Workspace control material

- `C:\DawnTrader-Codex\AUDIT_BRIEF.md` — whole file.
- `C:\DawnTrader-Codex\notes\crew-channel.md` — freshness header and returned recent excerpt; output truncated.
- `C:\DawnTrader-Codex\notes\my-questions-before-section-6.md` — whole file after creation.
- `C:\DawnTrader-Codex\notes\audit-session-1.md` — session record created from evidence gathered.

### Primary manuals and plans

- `C:\DawnTrader-Audit\1-system-manual\SYSTEM_MANUAL.md` — heading inventory and selected architecture, cost, price-basis, active-engine, and guard sections, including the entry-basis passage around 595-614.
- `C:\DawnTrader-Audit\1-system-manual\SYSTEM_IMPACT_MAP.md` — heading inventory and cross-cutting runtime-state registry around 2790-2820.
- `C:\DawnTrader-Audit\1-system-manual\RUNNING_ISSUES.md` — targeted provenance searches and selected entries including #618, maker/price-side issues, and mode-delete work.
- `C:\DawnTrader-Audit\1-system-manual\BATCH_CATALOG.md` — targeted provenance searches and selected RTB, maker/taker, cost, rename, and asset-class batch rows.
- `C:\DawnTrader-Audit\1-system-manual\PHASE_19_PLAN.md` — heading/status inventory and targeted in-flight searches, including #618 remaining work.
- `C:\DawnTrader-Audit\1-system-manual\POST_AUDIT_ROADMAP.md` — heading/status inventory and targeted in-flight searches, including `B-MODE-DELETE-SCOPE` and pre-live mode isolation.

### Code and schema

- `C:\DawnTrader-Audit\shared\schema.ts` — selected RTB and active-open-position declarations plus targeted searches.
- `C:\DawnTrader-Audit\migrations\meta\0001_snapshot.json` — RTB index declaration around 15052-15078.
- `C:\DawnTrader-Audit\server\storage.ts` — selected active-position and RTB persistence methods plus targeted caller/identity searches.
- `C:\DawnTrader-Audit\server\core\rtb\ready_to_buy_service.ts` — selected promotion cleanup, pair check, queued-signal lookup, duplicate/tiebreak, and queue sections.
- `C:\DawnTrader-Audit\server\lib\event-bus.ts` — whole file.
- `C:\DawnTrader-Audit\server\startup\trading-bootstrap.ts` — whole file.
- `C:\DawnTrader-Audit\server\services\active-execution-engine.ts` — selected lifecycle, guard, monitoring, and maker-placement sections plus targeted searches.
- `C:\DawnTrader-Audit\server\services\active-position-sizing.ts` — returned implementation excerpt; output truncated.
- `C:\DawnTrader-Audit\server\core\math\cost-model.ts` — cost formulas and targeted excerpts.
- `C:\DawnTrader-Audit\server\core\math\maker-taker-decision.ts` — whole file.
- `C:\DawnTrader-Audit\server\core\calculations\net-expectancy-kernel.ts` — returned excerpts; output truncated.
- `C:\DawnTrader-Audit\server\core\calculations\expectancy.ts` — returned excerpts; output truncated.
- `C:\DawnTrader-Audit\server\services\module-constants-service.ts` — whole file.
- `C:\DawnTrader-Audit\server\services\price-cache.ts` — whole file.
- `C:\DawnTrader-Audit\server\index.ts` — targeted active-position caller searches.
- `C:\DawnTrader-Audit\server\exchanges\kraken\kraken-websocket-adapter.ts` — targeted active-position caller and price-path searches.
- `C:\DawnTrader-Audit\server\services\trailing-exit-controller.ts` — targeted active-position caller searches.
- `C:\DawnTrader-Audit\server\services\signal-orchestrator.ts` — targeted pipeline/basis searches only.
- `C:\DawnTrader-Audit\server\services\pre-execution-validator.ts` — targeted guard searches only.

### Batch/history records

- `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion\B79_0n_RTB_COMPLETION_REPORT.md` — full returned report except where the multi-file command truncated later combined output.
- `C:\DawnTrader-Audit\Claude Comms and Packages\Scope Files\B79_0n_RTB_SCOPE.md` — returned excerpts; combined output truncated.
- `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion\BATCH_79_0m_a_COMPLETION_REPORT.md` — targeted retrospective-index passages.
- `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion\P19_B7_2_COMPLETION_REPORT.md` — whole returned report.
- `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion\P19_B7_2c_COMPLETION_REPORT.md` — whole returned report.
- All files under `C:\DawnTrader-Audit\Claude Comms and Packages\Batch Completion` — bounded text-search corpus only; individual files not otherwise listed were not read in full.
- Git history for `shared/schema.ts`, `server/storage.ts`, `server/core/rtb/ready_to_buy_service.ts`, `server/core/math/maker-taker-decision.ts`, and the maker-placement block—targeted `log`, `blame`, and `show` reads.

## Audit boundary

This was a source/history/manual audit at the pinned clean commit. I did not access the production database or runtime logs, mutate the audited clone, deploy anything, or propose code changes. Executable falsification queries are in `C:\DawnTrader-Codex\out\QUESTIONS.md`.

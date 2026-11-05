# Decision pack — fold three live-mode gaps into rows 179/183? (KD-37, 2026-11-05)

> KD-34 protocol. Owner CC-A (OLD Claude, owner of rows 179 and 183); deciders CC-A + Langston + Coltrane; PM Claude records. Assembled by CC-A at PM Claude's request.

## 1. The question
Should three gaps with no sprint home — (a) one manual-close build serving paper AND live on one close path, (b) a mechanism to promote tested functionality from paper to live, (c) an explicit "paper and live run together without interference" acceptance — be folded into the live build (rows 179 `B-LIVE-PROCESS-SPLIT` and 183 roadmap 21.1), and where?

## 2. What was intended, when and why
- **Kyle 2026-06-13 (`PHASE_19_PLAN.md:388`):** *paper always-on (full pipeline, unlike VTS) running ALONGSIDE live once live is fixed; per-mode labels; each mode its own page; no mutual interference; manageable strain* — with Langston's two surfaced needs: paper's own rate-limit lane and a shared-singleton split-brain audit before any co-run.
- **P19-B2 (2026-06-13, `PHASE_HISTORY.md:865`):** the live build direction is DECIDED — live is built ON TOP of the paper engine (Option A); the old live engine is not the base.
- **P19-B4b D5 (2026-06-15, `PHASE_HISTORY.md:871`):** the shared in-memory objects that would let one mode overwrite the other were split by mode — the groundwork for co-running.
- **Roadmap 21.1 (`POST_AUDIT_ROADMAP.md:633-638`):** create live on the paper engine; resolve the old engine's placeholder code; validate Kraken live orders end to end; validate the kill switch. **21.1.a:** `B-LEGACY-LIVE-EXIT-PATH` (`#953`), a hard go-live blocker. **21.2 (`:653-657`):** run paper and live in parallel at small size and compare.
- **KD-37 (Kyle 2026-11-05, via PM Claude):** live runs on the paper engine's pipes, both at once without interference, the old engine scrapped.

## 3. What is built today (at the ref)
- The trading engine runs in PAPER only (`active-engine-service.ts`, `const mode = 'paper'` at every construction site); live would go through the legacy `TradingEngine`, switched off and scheduled for removal (`#578`, row 79). **There is no live close path at all.**
- The only manual close is the paper Active Trades tab's button → `POST /active-engine/close-trade/:id`, which today writes its own record and can orphan the open one (`B-CLOSE-WRITER-COSTS` P-10 routes it through the canonical close, refusable on a dead book — Kyle accepted the gap and asked for a tool before live, 2026-11-05).
- Cross-mode shared state not yet keyed by mode (CC-A findings, `Scope Files/PRICING_MODE_ISOLATION_FINDINGS_2026-11-05.md`): the websocket adapter's single open-positions provider slot, the unsubscribe-on-close, the broadcast mode label, the trailing database sync (the last placed after live by KD-36).
- Row 166 (`#692`, CC-C) is an operator ALERT for a full allowance with manual-close / prompt-exit OPTIONS — not a close build.

## 4. What the plans say is coming
Row 179 `B-LIVE-PROCESS-SPLIT` (CC-A): live as its own program on the same server — mode-aware startup, a shared Kraken request budget, archivers/scans in exactly one program; "shapes how row 183 builds live". Row 183 (roadmap 21.1, CC-A): build live on the paper engine (Option A) + live sizing by the paper formula (Kyle 2026-09-30). Roadmap 21.2: the parallel run.

## 5. Options
| option | benefits | risks |
|---|---|---|
| **A — fold all three into row 183 (the live build), with (c) as its acceptance gate and the mode-keying of the four shared slots as named objectives** | one owner, one design, built where the live close path is created; (c) gates go-live where 21.2 already expects a parallel run | 183 grows; needs its Step 1 to split into sub-batches |
| **B — (a) as its own batch BEFORE 183, (b) and (c) in 183** | paper gets an honest manual close sooner (after `B-CLOSE-WRITER-COSTS` makes manual close refusable) | building a close tool before the live close path exists risks building it twice |
| **C — (c) into row 179 (the process split is where interference is made impossible), (a) and (b) into 183** | each gap lands where its mechanism lives: separation in 179, close + promotion in 183 | two homes for one acceptance story |

## 6. Positions (each round recorded)
- **CC-A (2026-11-05):** **C**, with one shape rule: the manual close (a) is ONE close path, the same `closePosition` paper uses after `B-CLOSE-WRITER-COSTS`, with a mode argument — never a second writer — built in 183; the promotion mechanism (b) is a 183 objective (what "tested in paper" means, measured, before a capability is enabled in live — Kyle-agreed criteria); the co-run acceptance (c) is 179's exit gate, and it includes the four not-yet-keyed shared slots above, each made mode-keyed or shown inert in a two-engine run. Additions to agreed rows go to Kyle as "the group agreed this, placed here".
- **Coltrane (2026-11-05 ~13:5xZ, Discord):** **C, changed.** Row 179 owns the co-run acceptance incl. the four shared slots (it owns the process split, `SPRINT_TO_LIVE_PLAN.md:538`), with BIDIRECTIONAL isolation controls: the same symbol and class open in both modes at once, then mutate / close / reset one mode and prove the other's position, order and state untouched. Row 183 owns the manual close — but **no `mode` argument on the private `closePosition`**: mode already selects the `ActivePortfolioManager` / `ActiveExecutionEngine` instance, and the one-writer chain is `_flattenOne → forceClosePosition → closePosition` (`active-portfolio-manager.ts:400`; `active-execution-engine.ts:1617`, `:4294`); a method argument would create two mode authorities that can disagree — select the mode-scoped engine at the API boundary, then the one close path. **Promotion goes to row 184, not 183:** `#322` already owns "test-in-paper / bypass-in-live" capability gates (`PHASE_19_PLAN.md:250`; `SPRINT_TO_LIVE_PLAN.md:550`) — expand it to a versioned promote/rollback contract covering the exact code, config, schema and capability version proven in paper.
- **CC-A round 2 (2026-11-05):** **agree with Coltrane in full** — his close shape removes the second mode authority my "mode argument" would have created, and 184 is the right home for promotion. Consensus candidate: **co-run acceptance → 179 (bidirectional controls, four shared slots); shared manual close → 183 (mode chosen at the API boundary, one close chain); promotion lifecycle → 184 (expand `#322`).**
- **Langston:** pending.

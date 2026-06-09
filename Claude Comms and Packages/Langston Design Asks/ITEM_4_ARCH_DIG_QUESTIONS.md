# Item 4 — Joint Architecture Dig (verify/refute, code-level)

Kyle directive: figure out how the three systems (VTS / paper / live) are actually wired before we scope the untangle. This is a figure-out-the-architecture pass, NOT a sign-off. Verify or refute against the live code (use `ssh staging`, repo at `/home/deploy/dawntrader`).

## Context
My first-read findings draft is at `/home/langston/inbox/item-4/ITEM_4_ARCHITECTURE_INVESTIGATION.md`. I claimed the active path is already largely per-mode-instanced (concurrency-ready). Kyle thinks that's wrong, and my deeper trace is now agreeing with Kyle.

**Kyle's mental model (test this):** VTS is its own separate system. Active trading uses ONE shared scaffolding that just switches behavior by the selected mode (paper OR live). The trading UI is ONE shared page/tab-set for both modes, not per-mode. Live mode has NEVER actually been instantiated/run. When active trading turns on, VTS genuinely STOPS (not merely relabeled). So isolating paper would leave live with nothing to flow through — we'd need to build a mirrored live STUB so we end up with three standalone systems (VTS, paper, live-stub).

**What my deeper trace found (corroborate/correct):**
- `server/routes.ts:99-100` constructs BOTH `globalLiveEngine = new TradingEngine('live')` AND `globalPaperEngine = new TradingEngine('paper')` at module load — but the start route (`routes.ts:3631`, `:3651` `globalLiveEngine.start()`, `:4683` picks `tradeMode === 'live' ? globalLiveEngine : globalPaperEngine`) starts only ONE, by selected mode.
- A SECOND, legacy engine path: `PaperExecutionEngine` constructed by `paper-portfolio-manager.ts:65` + `paper-48hr-simulation.ts:53` — BOTH on the Phase-16 legacy delete register (#136), userId-coupled.
- A THIRD construct: `(global as any).tradingEngines` Map (`live-trading-service.ts:160-161`).
- So: multiple overlapping engine abstractions; only one started at a time; live likely never actually started.

## Questions (trace + answer, code-level)
1. **One engine or two at runtime?** When active trading starts, is ONE engine started for the selected mode, or two concurrent? What is `TradingEngine` vs `PaperExecutionEngine` vs the `global.tradingEngines` Map — which is the REAL live active-trading path, and which are legacy/dead?
2. **Does VTS actually stop on engine-start, or just get relabeled?** Trace the start/stop wiring + `vts-runner` gating + `run-mode-controller`. Is there code that stops/pauses VTS when an engine starts, or does it keep running with rows merely relabeled?
3. **How tangled with legacy?** How coupled is the live active path to the legacy userId-coupled code (`paper-portfolio-manager`, `paper-48hr-simulation`)? Is there a clean non-legacy path, or is the active path inseparable from the to-be-deleted code today?
4. **UI scaffolding:** one shared trading page/tab-set switched by mode, or genuinely per-mode?
5. **Net verdict:** is Kyle's "one shared scaffolding, needs a mirrored live stub, three-standalone-systems" model correct? Does that make the untangle BIGGER than my control-plane framing — possibly overlapping the Phase-16 legacy cleanup enough to change WHEN we do it (now vs. fold part into Phase 16/later)?

Give findings per question + your INDEPENDENT take on timing (now vs. later), with reasoning. Reply when done.

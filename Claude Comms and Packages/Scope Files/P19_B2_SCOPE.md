# P19-B2 SCOPE — Live-Mode Build-Approach Decision

> **Phase 19 · Batch 2 · DESIGN/DECISION batch (not an implementation batch).** Roadmap item **19-18** (reshaped per PHASE_19_PLAN §3.2). Author: Claude New (CC-B), 2026-06-13. Langston design-ask: pending. Kyle sign-off: pending.
>
> 🚨 **NO PRODUCTION CODE SHIPS IN P19-B2.** Live remains hard-gated (HTTP 409) until Phase 21. This batch produces a **ratified build-approach decision**, a recorded **Phase-19 plumbing constraint** that the decision implies, and a **homed legacy-stub finding** — nothing more. Implementation of live is Phase 21.

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)

No prior numeric/scope claims to reconcile. This is the first scoping of roadmap 19-18 since it was **reshaped** at the 2026-06-12 kickoff (PHASE_19_PLAN §3.2): the June-10 three-way cleave already made VTS / paper / live standalone with live hard-gated, so 19-18 collapsed from "build the live-mode separation" to the **narrower question below**.

---

## §1 — THE QUESTION (one line)

**How much of the active paper-trading engine does the eventual live (real-money) engine reuse — and what does that answer require us to keep clean while we debug paper in Phase 19?**

The "while we debug paper" half is why this is an **early** batch (B2, before the paper-plumbing batches B3–B6): the reuse decision dictates where the seams must stay clean during paper work, so it has to be made before that work, not after.

---

## §2 — ARCHITECTURAL GROUND TRUTH (code-verified, file:line — direct reads, not grep/memory)

**Finding 1 — the active-trading engine is ALREADY mode-parametric.** `PaperExecutionEngine` (`server/services/paper-execution-engine.ts:119`) declares `private mode: 'live' | 'paper'` (`:120`); the constructor takes `mode: 'live' | 'paper'` (`:172`) and threads `this.mode` through every seam — open-position storage reads (`:221`), the ready-to-buy pool (`:226`), the live-pricing adapter mode (`:279/:289`), session bookkeeping (`:295`), and the exit call. The class was built to run live; `'live'` is a first-class allowed value throughout, not a future bolt-on.

**Finding 2 — exits are already mode-aware and shared.** The engine consumes the canonical exit controller with `callerMode: this.mode === 'live' ? 'live' : 'paper'` (`:953`-region), and `evaluateTECExit` (`trailing-exit-controller.ts`) defines `CallerMode = 'vts' | 'paper' | 'live'` with per-mode concurrency state. VTS, paper, and (future) live all exit through the **same** controller. Exit math has no mode branch.

**Finding 3 — exactly TWO seams diverge between paper and live.**
- **OPEN seam** — `paper-execution-engine.ts:2196`: `storage.createPaperSimOpenPosition(this.mode, {...})`. This is a **simulated** fill written straight to the `paper_sim_*` partition with modeled entry slippage + fee. Live must instead place a **real Kraken order** (`server/exchanges/kraken/kraken.ts:534` `addOrder({ pair, type:'buy', ordertype, volume, ... })`), await the real fill, and record the **actual** fill price + order id.
- **CLOSE seam** — `paper-execution-engine.ts:1104`: `private async closePosition(...)`. Simulated exit at the mark price. Live must instead place a **real exit order** (market-sell / stop / target) on Kraken and record the actual exit fill.

Everything else in the engine is mode-agnostic and **already runs identically** when `mode === 'live'`: real-Kraken price fetches (`:371`, `:751`), the 1.5s monitoring loop, position metadata capture (regime/confidence/DI/ATR/volNoise), per-class DB-resolved fees, ready-to-buy consumption, the WebSocket subscribe path, and the lifecycle-audit writes.

**Finding 4 — the live hard-gate is on the MODERN start path.** `routes.ts:3772-3791`: the engine-start handler reads `module_constants` module `'live_engine_gate'` field `live_engine_enabled`, requires it to be **strictly `=== 1`** (`:3781`), is **fail-closed** (missing/failed read → `false`, `:3784`), and refuses a live start with **HTTP 409 `LIVE_ENGINE_PHASE21_GATED`** (`:3786-3791`). The flip instruction is paper-trailed in roadmap 19-17b (Phase-21 go-live checklist). This is the gate that would otherwise instantiate `new PaperExecutionEngine('live')`.

**Finding 5 — `live-trading-service.ts` is a LEGACY userId-coupled STUB, not the live engine.** `server/services/live-trading-service.ts` is a **separate class** (`LiveTradingService`, Phase 22.3 / Phase 41F) that:
- is keyed by `userId` (legacy user-ID coupling — the exact §5-rule-18 legacy-register theme);
- on "activate", creates a **fake placeholder object** `{ userId, mode:'live', isRunning:true }` (`:164-170`) — **not** a real `PaperExecutionEngine` instance;
- its own comments admit it: *"Initialize trading engine (placeholder for now)… In production, this would initialize the actual TradingEngine with live Kraken API"* and *"Create engine instance (simplified for now)"*;
- never calls Kraken `addOrder`, never consumes TEC, never runs a monitoring loop — it does **no execution**;
- is wired to the legacy `/live-trading/{start,stop,status,approve}` routes (`routes.ts:5545+`), a **second, pre-cleave live entrypoint** distinct from the modern gated start path in Finding 4.

This stub predates the June cleave and contradicts the mode-based architecture. It is **not** the foundation live should be built on.

**Finding 6 — storage is already partitioned for three producers.** Per the Item-4 storage-for-3 close: the learning-store key carries `source` REQUIRED-no-default with `LearningSource = RunMode` (`'vts' | 'paper_sim' | 'live'`); the `live` partition is **reserved and structurally ready** (Phase 21 fills it). Live execution does not need new storage architecture — only the live order/fill records.

---

## §3 — THE DECISION + RECOMMENDATION

**RECOMMEND: Option A — live reuses the paper engine by EXTENSION, swapping only the two order-placement seams; the legacy `LiveTradingService` stub is designated NOT-the-live-path and marked a Phase-21 retire candidate.**

Live = the same `PaperExecutionEngine` (or a thin subclass) constructed with `mode='live'`, where only the OPEN and CLOSE seams (Finding 3) route to real Kraken orders + real fill confirmation instead of simulated fills. Every other path — exits, ready-to-buy, pricing, monitoring, fees, metadata, audit — is inherited unchanged.

**Tradeoffs considered (Option B — build a separate live engine):**
- *Pro of B:* maximal isolation — a live bug provably can't be a shared-code regression, and live could diverge freely.
- *Why B loses:* it duplicates ~the entire exit/ready-to-buy/pricing/monitoring machinery, which is the textbook **NO-PATCHES (§5.15)** anti-pattern, and it fights an engine that was **deliberately built mode-parametric** to avoid exactly that fork. The isolation B promises is already delivered by three existing mechanisms — the strict fail-closed **409 gate** (Finding 4), the **two-seam boundary** (Finding 3), and the **per-mode storage partition** (Finding 6) — without forking thousands of lines of validated exit/sizing logic that we will have just spent Phase 19 debugging. Forking would mean live runs *unproven* copies of code paper proved.

**Net:** the architecture already answered most of this question; P19-B2 ratifies it and records the one constraint it imposes on Phase-19 work (§4).

---

## §4 — WHY THIS IS AN EARLY DECISION (the Phase-19 plumbing constraint it imposes)

Because live reuses the engine by extension, the **two order seams must stay thin and explicitly bounded** while we debug paper in B3–B6. The constraint P19-B2 records (and that later Phase-19 batches must honor):

1. **The open/close order-placement seams stay a single, clearly-marked boundary** — not logic sprawled across the monitoring loop. When Phase 21 builds live, it should override *only* those two points.
2. **No paper-only assumption leaks into shared paths.** Specifically the **"fill is instant, total, and never rejected"** assumption that paper bakes in (modeled slippage at `:2120-2121`, the mock-price fallback in the pricing adapter). Live fills can be **partial, delayed, or rejected** — so the seam must be the place fill-confirmation lives, and the shared monitoring/exit code must not assume a position exists the instant a signal promotes. If we let paper treat "promoted → filled" as atomic *inside shared code*, live reuse gets expensive.
3. **Position sizing already threads mode** — keep it that way; live sizes against a real balance, paper against the simulated portfolio, but both go through the same mode-aware sizing entry (no new fork).

This is the concrete payoff of deciding now: B3–B6 keep the seam clean instead of us discovering at Phase 21 that paper-only assumptions calcified into shared code.

---

## §5 — LEGACY FINDING + HOME (§9.4 surfaced-issue scheduling)

**`live-trading-service.ts` (`LiveTradingService`) + its `/live-trading/*` routes are a legacy userId-coupled stub (Finding 5).** Disposition decided here, at the moment of surfacing:
- **Home:** Phase 16 legacy-component review register (`RUNNING_ISSUES.md` #136, §5-rule-18) — add the file/symbol/why-legacy entry now.
- **Overlap already homed:** PHASE_19_PLAN §6 pre-flight **gate #8** (#213 — "legacy `/live-trading` routes confirmed inert", a 5-minute check at B7b pre-flight). That gate proves the stub can't fire once the engine is hot.
- **Retire timing:** the stub is a **Phase-21 retire candidate** — removed/replaced when the live build lands on `PaperExecutionEngine`, **not** ripped out now (no code change in P19-B2; removing it mid-Phase-19 is gratuitous churn with no Phase-19 benefit). Decision recorded so it is a scheduled retirement, not a vague "someday."

---

## §6 — DELIVERABLES OF P19-B2 (decision batch)

1. **Ratified build-approach decision** — Option A, via CC↔Langston architectural consensus (§3) **and** Kyle sign-off (architecture/go-live is Kyle's call per §6.7).
2. **Recorded Phase-19 plumbing constraint** (§4) — written into PHASE_19_PLAN §5 decision log and surfaced to B3–B6 so the seam discipline is honored during paper debugging.
3. **Legacy-stub finding homed** (§5) — RUNNING_ISSUES #136 register entry + Phase-21 retire note; cross-referenced to plan gate #8 / #213.
4. **No production code change** — live stays 409-gated; this batch is decision + governance only.

---

## §7 — VERIFICATION CRITERIA (how P19-B2 is "done")

| # | Criterion | Evidence |
|---|---|---|
| 1 | Langston returns an architectural ACK on Option A (or a reasoned counter we resolve to consensus) | Langston reply, relayed verbatim |
| 2 | Kyle signs off on the build approach | Kyle ack in chat |
| 3 | Decision + Phase-19 plumbing constraint recorded in PHASE_19_PLAN §5 and roadmap 19-18 anchor | doc diffs |
| 4 | Legacy-stub finding logged to RUNNING_ISSUES #136 with Phase-21 retire home | doc diff |
| 5 | PHASE_19_PLAN §1 status row P19-B2 → DONE | doc diff |

No staging/UI verification applies (no runtime change). No CI run beyond governance commits.

---

## §8 — DESIGN ASK FOR LANGSTON (the questions to weigh in on)

**Q1 — Build approach.** Do you agree with **Option A (reuse-by-extension)** over a separate live engine, given the engine is already mode-parametric (Finding 1-2) and only the two order seams diverge (Finding 3)? If you'd build separate, what shared-code risk justifies duplicating the exit/RTB/pricing/monitoring machinery we'll have just debugged?

**Q2 — The two-seam claim — stress-test it.** Is "only OPEN-order-placement and CLOSE-order-placement diverge" actually complete, or am I under-counting live's divergence points? Candidates I want your read on: **partial-fill / rejection / timeout handling** (paper assumes atomic total fill), **order-type choice on the close side** (market vs the simulated stop/target), **guardrail strictness for real money**, **balance/equity source for sizing**, **reconcile-on-restart** (live has real open orders to reconcile; paper doesn't). Which of these are genuine seams that Phase-19 plumbing must keep clean, vs Phase-21-build concerns?

**Q3 — Seam formalism, now vs Phase 21.** Is "keep the two seams thin + no paper-only fill assumptions in shared code" the right **Phase-19** constraint, or do you want a stronger structural boundary **defined now** (e.g. an explicit `OrderPlacer`/execution-port interface that paper and live both implement) so the seam is a typed contract rather than a discipline? Trade-off: defining the interface now front-loads a little design into a decision batch but guarantees the seam; deferring it to Phase 21 keeps P19-B2 truly code-free but relies on B3–B6 discipline.

**Q4 — Legacy stub disposition.** Agree the `LiveTradingService` stub is designated NOT-the-live-path, homed to the #136 legacy register, and retired at Phase 21 (not now)? Or do you see a reason to retire/neutralize it earlier — e.g. does its existence as a second live entrypoint create a real risk before B7b gate #8 catches it?

---

*P19-B2 is decision + governance only. On Langston consensus + Kyle sign-off, record the decision and close — no code, no deploy.*

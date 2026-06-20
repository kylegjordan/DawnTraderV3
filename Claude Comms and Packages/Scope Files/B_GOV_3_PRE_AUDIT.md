# B-GOV-3 — Pre-Implementation Audit (Step 2)

**Owner:** OLD Claude (CC-A). **Created:** 2026-06-21. Pairs with `B_GOV_3_SCOPE_governance-checker-golive.md` (Langston Step-1 queued — behind reorg-B2). **change-class:** non_architecture (process tooling; no trading-engine/strategy/regime/math touch → System Manual N/A). **Comms:** Discord. **Autonomy:** Kyle authorized iterate-with-Langston-to-verified-close (2026-06-21).

## §1 — Grounding (read in full): the checker as it stands
`scripts/governance-checker/{config.mjs, poller.mjs, checker.mjs}` + tests. The poller's **decision logic is pure + unit-tested** (`computeBatchStates`, `decideAlerts`); the **side-effects** (`gitFetchAndLog`, `alertSink`, state IO) run only when deployed to the staging-local clone under its own systemd timer. **Current live state:** installed on staging, timers **DISABLED** since the 2026-06-19 flood (88 `info` governance alerts on pre-checker historical batches — the §10.5 reader surfaces `info`, so "shadow" wasn't actually silent). `SHADOW_MODE = process.env.GOV_SHADOW !== '0'` (config.mjs:167) → exit = `GOV_SHADOW=0`.

## §2 — Per-objective implementation points (file:line)
**OBJ-1 — Grandfather cutoff (the flood fix).** Root cause: `gitFetchAndLog` pulls the last 300 commits and `computeBatchStates` grades EVERY batch-id in that window — including batches that closed before the checker existed. **Fix (config cutoff, the scope's preferred (a)):**
- `config.mjs`: add `export const ENFORCEMENT_CUTOFF_MS = Date.parse('<go-live ISO>')` (a single date, not 30 hand rows).
- `poller.mjs`: in `tick()` after `computeBatchStates`, FILTER OUT any batch whose `lastCode` (or `firstCode`) is `< ENFORCEMENT_CUTOFF_MS` BEFORE `decideAlerts` — so pre-cutoff batches are never graded (and any already-open alerts for them get resolved on the next clean tick via the existing resolve path). Pure-testable: add the cutoff as an `opts` override to `decideAlerts` OR filter in `tick` (lean: filter in `tick`, keep `decideAlerts` cutoff-agnostic + add a unit test on the filter).
- **Cutoff value:** the go-live timestamp — grandfathers ALL currently-closed batches (incl. B-DISCORD, reorg-B2). Recorded in `GOVERNANCE_EXCEPTIONS.md` (the grandfather decision note already exists there). Langston confirms the value.

**OBJ-2 — Make shadow truly silent (the surfacing fix).** Root cause: `alertSink.add` always writes to the §10.5 queue via the system-alerts CLI; in shadow `sev()` only downgrades to `info`, but the §10.5 reader surfaces `info` (state=active, acknowledged_at=null). **Fix (scope's preferred (a) — shadow = log-only):**
- `poller.mjs`: when `SHADOW_MODE` is true, the `alertSink.add` path must NOT call the system-alerts CLI — instead append the intended alert to a LOCAL log (e.g. `.gov-checker-shadow.log` beside the state file) so a shadow run is observable ONLY by deliberate inspection, never a page. Resolve-path unaffected (nothing was queued to resolve). Keep the pure `decideAlerts` unchanged (it already tags `sev=info` in shadow); the GATE is at the sink.
- Add a `poller.test.mjs` case: in shadow, `toOpen` is computed but `alertSink.add` (CLI) is NOT invoked (inject a spy sink).

**OBJ-3 — Validation backtest (the B-GOV Obj-11 gate).** Run `computeBatchStates` + `decideAlerts` over the last ~15–20 CLOSED batches from real git history and assert: (a) ZERO false alarms on known-good clean closes; (b) it FLAGS a known real gap (e.g. B3b's missing pre-audit, or B-DISCORD as a clean PASS + a seeded-gap case). Implementation: a backtest harness (extend `poller.test.mjs` or a `scripts/governance-checker/backtest.mjs`) that feeds historical commit records through the pure logic with the cutoff applied. Langston manually verifies the dogfood result (B-GOV self-governance circularity — don't trust the checker's self-PASS).

## §3 — Blast radius / SIM
- The checker is an **isolated process** (own systemd timer on staging, its own local clone, NOT the dawntrader node loop — Item-4). It only READS git + WRITES to the §10.5 alert queue via the CLI. No trading-path coupling. Blast radius LOW (boundary: it can only create/resolve `category=governance` alerts).
- SIM: the governance-checker is process-tooling (already noted in B-GOV/B-GOV-2 governance). A SIM touch is OPTIONAL (no new trading component / cross-cutting trading state). System Manual: N/A (declared).

## §4 — GO-LIVE GATE (all three green, then flip)
Seed/cutoff confirmed (OBJ-1) + shadow truly silent (OBJ-2) + backtest passes clean + catches a known gap (OBJ-3) → set `GOV_SHADOW=0` + `systemctl enable --now governance-checker.timer` on staging → one live tick, confirm no false flood + a real gap pages. **★ SEQUENCING (Kyle 2026-06-21):** the BUILD (OBJ-1/2/3) is safe anytime; the **go-live FLIP is gated on the branch being SETTLED** — reorg-B2 normalizer rework is in flight, and the checker should grade a clean, finished branch. So: build + Langston Step-4 now-ish; flip after the in-flight reorg work closes.

## §5 — Open items for Langston (Step-1 on scope + Step-2 on this)
- Confirm the cutoff VALUE (go-live date) + that grandfathering B-DISCORD/reorg-B2 (clean recent closes) is intended, with B-DISCORD usable as a backtest PASS case.
- Confirm shadow=log-only (vs the §10.5-reader-filter alternative) is the right home for the surfacing fix.
- Confirm the backtest's known-gap fixture (which historical batch to assert-flags).

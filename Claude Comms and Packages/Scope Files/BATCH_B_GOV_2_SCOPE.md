# BATCH B-GOV-2 — Governance-Checker Activation (the HARD pre-activation gate, then turn it ON)

> **change-class:** non_architecture (process tooling — checker scripts + systemd units + the CLAUDE.md convention; touches no trading/engine/regime/filter/math code)
> **Owner:** Claude Old (CC-A) scopes AND implements (with Langston) — same as B-GOV; the checker is CC-A's domain (`scripts/governance-checker/`), independent of Claude New's Phase-19 trading-code work, so no shared-file collision.
> **Status:** Step-1 scope → Langston Step-1 → CC-A implements Step-3+ → Langston Step-4 → **ACTIVATE** (install + enable the systemd timer) → Step-8.
> **Why this exists:** B-GOV shipped the governance checker **INERT** (RUNNING_ISSUES #324). It does nothing today. B-GOV-2 is the gate that makes it actually run and then turns it on. Without B-GOV-2 the checker is dead-weight.

---

## 0. What B-GOV left undone (the activation blockers — from the B-GOV completion report + Langston Step-4)
1. **No change-class declaration** → `computeBatchStates` never sets `declaredClass`, so EVERY batch falls to `DEFAULT_CLASS = architecture`, which requires SYSTEM_MANUAL + SIM content on everything → **false doc-gap REDs on every sub-batch / non-arch close if the timer is flipped on as-is.**
2. **Dead-man heartbeat unwired** → `HEARTBEAT_MISS_LIMIT` is a defined-but-unused constant; `Persistent=true` only gives boot catch-up, not silence-detection → **a silently-dead checker = zero enforcement with nobody told** (the §18 failure mode).
3. **Long-autonomous-batch handling not proven** (Kyle directive 2026-06-17) → a big batch run autonomously with Langston can have long gaps between code pushes + MEMORY-backup commits + compactions; it must be marked OPEN so the 4h deadline does not false-fire mid-run. The open-state exists in the design but isn't tested for this exact common pattern.

## 0.5 STEP-1 RECONCILIATIONS (Langston review 2026-06-18 — APPROVE-conditional, all folded in)

**★ HOST CHANGED to STAGING (deviation from the B-GOV design — Langston rec, adopted):** run the checker ON STAGING (`188.245.193.8`), NOT the Langston box. Rationale: the `system-alerts` queue lives on staging (no cross-host SSH per alert-write → removes a whole failure class); staging is reliable always-on infra (runs the live app + existing cron timers + the cron-fire-evidence verifier), vs the workstation-class Langston box with demonstrated instability (gdrive FUSE wedges, rogue loops, multi-day gaps); single clock for all deadline math (4h/48h/heartbeat) — no cross-box skew. Install needs root (CC-A is `deploy`-only) — same access path as the existing cron-fire-evidence verifier, handled at OBJ-5. **This supersedes OBJ-5's "Langston box" line and the alert-sink ssh-staging hop (now local).**

**★ DEAD-MAN (OBJ-3) resolved by the host change:** the checker pushes a heartbeat each tick; a **sibling staging timer / fold into the existing cron-fire-evidence verifier** watches for heartbeat staleness (absence of pushes = the signal). Process-death → caught by the staging sibling; host-death of staging → already loudly caught by the live trading system's own monitoring. Full coverage, no cross-host fragility.

**★ CHANGE-CLASS in the SCOPE HEADER confirmed (OBJ-1) — NOT the commit message.** Requirements: (a) a fixed **batch-id → scope-file path resolution convention** (canonical `Claude Comms and Packages/Scope Files/` location keyed by batch-id); (b) missing/unparseable scope → **strictest + flag** (fail-closed). Scope header is amendable (a sub_batch that grows re-declares); OBJ-2's path-heuristic catches a diff that outgrows a stale declaration. A commit trailer is fine only as a redundant cross-check signal, never primary.

**★ SIX Phase-19-readiness items FOLDED INTO B-GOV-2 (Langston §4 — named home = THIS batch):**
- **OBJ-1b — per-batch-per-condition alert dedup/cooldown (the #1 "don't ship without it"):** a checker ticking every few minutes for WEEKS must NOT re-fire the same persistent condition every tick (→ §10.5 fatigue). Once-per-condition-per-batch; suppress until state changes. (The poller already dedupes opens via `state.openAlerts`; harden + test for the persistent-condition case.)
- **OBJ-5b — activation-day backfill:** when the timer flips on, in-flight batches (P19-B4b, B6.5c, etc.) predate the OBJ-6 header convention → undeclared → architecture → false REDs on mid-flight work. SEED `GOVERNANCE_EXCEPTIONS.md` with class + OPEN for every currently-open batch so the FIRST live tick is clean.
- **OBJ-4b — explicit + tested CLOSE-SIGNAL:** pin what flips a batch open→closed (completion-report commit? BATCH_CATALOG entry? a tag?) and unit-test it — ambiguity here causes both false-fires and misses; it interlocks with OBJ-4's OPEN handling.
- **OBJ-4c — OPEN can't be a silent permanent bypass:** add a max-age escalation (low-sev nag past ~7d still-OPEN) on top of the 48h "still open?" ping; confirm who/what clears OPEN.
- **OBJ-5c — graceful git-fetch degradation:** a failed/stale fetch degrades to a low-sev "couldn't fetch", NEVER a false RED off stale state.
- **OBJ-5d — pin the numbers + SHADOW window:** state `TICK_MINUTES` + `HEARTBEAT_MISS_LIMIT` concretely (e.g. 15m × 4 = ~1h dead-man latency) in the completion report; run the FIRST batch-or-two in **low-sev/shadow** to calibrate against live Phase-19 patterns (autonomous batches, MEMORY-backup cadence) before any warning-sev is trusted — the Obj-11 backtest covers history, not these new live patterns.

**★ GOVERNANCE_EXCEPTIONS.md is now load-bearing** (class audit trail + OPEN declarations): give it a **defined schema** + make the checker **tolerant of malformed/missing entries** (fail toward strictest, never crash the tick).

**System Manual N/A — Langston blessed explicitly** (process tooling, not strategy/regime/filter/signal/math → SIM-scope only; the SIM inert→active flip IS required).

---

## 1. Numbered objectives + verification

### OBJ-1 — Change-class declaration (the linchpin of a correct live run)
- Define a **machine-readable class line in the scope-file header** (e.g. `change-class: architecture | non_architecture | sub_batch | hotfix`), and a matching **CLAUDE.md convention** (OBJ-6) so both sessions declare it.
- `computeBatchStates` / the poller reads the declared class for each open batch-id (from its scope file) and passes it to `checkBatchDocset` instead of always `DEFAULT_CLASS`.
- **Undeclared → default to STRICTEST (architecture) + raise a low-sev "class undeclared" flag** (fail-closed toward over-asking, per the B-GOV design).
- Record the declared class in `GOVERNANCE_EXCEPTIONS.md` (the self-declared-input audit trail).
- **Verify:** a sub-batch declaring `sub_batch` is checked against the sub-batch doc-set (NOT forced to need SYSTEM_MANUAL/SIM); an undeclared batch defaults to architecture + flags; the class read is unit-tested.

### OBJ-2 — Path-heuristic under-declaration guard (Obj-12 from B-GOV)
- If a batch's diff touches **core engine paths** (strategy-engine, MCE/SQE/TEC, regime, the signal orchestrator, the pattern detector) but its declared class is non-architecture → route a "class may be under-declared — verify" alert to Langston. A path heuristic can't classify, but it catches obvious under-declaration (the misclassification hole that defeats the rock-solid mechanics).
- **Verify:** a batch declaring `sub_batch` whose diff touches `server/services/signal-orchestrator.ts` raises the under-declaration route; a docs-only batch does not.

### OBJ-3 — Dead-man heartbeat (self-liveness)
- The poller writes a `lastTick` timestamp every tick (already in state); add a **silence-detector**: if `now - lastTick > TICK_MINUTES × HEARTBEAT_MISS_LIMIT`, emit a **`warning`-sev** `governance-checker-silent` alert into the §10.5 queue (a dead checker = enforcement OFF; it should page even during the shadow window, and the heartbeat does NOT honor shadow — Langston Step-4). Implement so it fires even if the poller itself is dead — i.e. a **separate tiny systemd timer / check** (the checker can't report its own death), OR fold into the existing dawntrader cron-fire-evidence verifier pattern (it already detects stale schedules).
- **Verify:** stop the poller; within `HEARTBEAT_MISS_LIMIT` ticks a silent-checker alert appears.

### OBJ-4 — Long-autonomous-batch OPEN handling (Kyle directive 2026-06-17)
- Confirm + test that a batch declared OPEN (in `GOVERNANCE_EXCEPTIONS.md`) suspends the 4h deadline, and that **MEMORY-only / housekeeping commits never reset or trip the deadline** (they're already exempt — prove it). Add the explicit test: a batch with [code push → 5× MEMORY-only backup pushes over 6h → governance push] produces **no** deadline alarm when declared OPEN, and a single low-sev "still open?" ping only past the 48h backstop.
- **Verify:** the simulated long-batch sequence produces no false deadline alarm; the housekeeping-exempt classification is asserted in a test.

### OBJ-5 — ACTIVATE (the actual turn-on — gated on OBJ-1..4 + Langston Step-4)
- Deploy `scripts/governance-checker/` to a **plain local clone** on a host (NOT the gdrive mount — C6) + `mkdir /var/lib/governance-checker`; install `governance-checker.{service,timer}`; `systemctl enable --now governance-checker.timer`.
- **Host decision (confirm with Langston):** the Langston box (Helsinki) per the B-GOV design, reaching the staging `system-alerts` CLI over `ssh staging` — re-confirm vs running it on staging directly.
- **Verify (Step-8):** a live tick runs clean; the heartbeat lands in `state.json`; a deliberately-incomplete test close raises a real `governance` alert in the §10.5 queue and clears when fixed (the first real end-to-end proof). Backtest (Obj-11) still GREEN on the deployed clone.

### OBJ-6 — CLAUDE.md: change-class-in-scope-header convention
Add a small additive line: every scope file declares its `change-class` in the header; the checker reads it; undeclared → strictest + flag. (Pairs with the B-GOV batch&phase naming convention.)

### OBJ-7 — Tests + governance
Unit tests for OBJ-1 (class read + undeclared default), OBJ-2 (path-heuristic), OBJ-3 (silence-detector), OBJ-4 (long-batch + housekeeping-exempt). Governance: BATCH_CATALOG, PHASE_HISTORY, MEMORY, RUNNING_ISSUES (#324 → RESOLVED), SIM (the checker becomes a LIVE component — flip its entry from inert to active), completion report. System Manual N/A (process tooling).

## 2. Acceptance criteria
- The checker is **LIVE** (systemd timer enabled, ticking) and **correct on a real batch**: it does NOT false-RED a sub-batch close (OBJ-1), it surfaces a genuine gap as a `governance` alert that clears on fix (OBJ-5), it does not false-alarm on a long autonomous batch with MEMORY backups (OBJ-4), and a dead checker is detectable (OBJ-3).
- CI all-4-green; checker tests green; backtest Obj-11 GREEN on the deployed clone.
- RUNNING_ISSUES #324 closed; SIM entry flipped inert→active.

## 3. Notes
- This batch TURNS THE CHECKER ON. It is detect-not-block (zero risk to the trading system), and running it during Phase-19's active batch churn is a useful real-world test.
- The one standing process change: every batch declares its change-class in the scope header (OBJ-6). Light habit, both sessions.

# B-GOV-3 — Governance-checker go-live (out of shadow mode)

**Owner:** OLD Claude (CC-A). **Created:** 2026-06-20 (Kyle pushed: the shadow-exit conditions had no schedule → the checker would never go live). **change-class:** non_architecture.
**Why now:** the checker is built + activated-in-shadow but its timer is DISABLED. The three exit conditions were named but unscheduled — this batch schedules and executes them so the watcher actually turns on. Getting it live *helps* enforce the B-DISCORD governance batch + everything after, so it runs as a near-term governance batch (next, or interleaved with the B-DISCORD governance write-up).

## Current state (grounded 2026-06-20)
- `SHADOW_MODE = process.env.GOV_SHADOW !== '0'` (config.mjs:167) — shadow ON; downgrades alerts to `info`. Exit = set `GOV_SHADOW=0`.
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` exists, ledger EMPTY.
- `governance-checker.timer` on staging = **inactive + disabled** (turned off after the 2026-06-19 activation flooded the §10.5 queue with 88 `info` governance alerts — the §10.5 reader surfaces `info` too, so "shadow" wasn't actually silent).

## Objectives (ordered) + go-live gate

**Obj-1 — Seed the exceptions ledger (the flood fix).**
- Establish a **grandfather cutoff**: batches that CLOSED before the checker went live are not retroactively enforced. Decide the mechanism — either (a) a cutoff date/commit in config so the checker ignores pre-cutoff closes, OR (b) explicit `na-skip` grandfather rows for each pre-checker batch the checker currently flags (P19-B1/B2/B3a/B3b/B4a, B-NEW-22, B67.1, + the rest of the 88).
- Prefer (a) a config cutoff (cleaner than 30+ hand rows); fall back to (b) for any post-cutoff batch with a genuine gap.
- Per-batch dispositions that OVERRIDE a REQUIRED doc need Langston confirm (Item-3 tiering); cc-declared rows carry `confirmed_by = pending` until then.
- **First-pass seed landed this turn** (grandfather rows for the known-flagged batches, `pending` Langston confirm) — see ledger.

**Obj-2 — Make shadow truly silent (the surfacing fix).**
- In shadow mode the checker must NOT surface in the §10.5 per-turn read. Options: (a) in shadow, write governance alerts log-only (not to the §10.5 queue), or (b) the §10.5 reader filters `category=governance` + `severity=info` while shadow. Pick one; shadow becomes observable only by deliberate inspection, never a page.
- Code touch: `scripts/governance-checker/poller.mjs` (+ config). Add a test in `poller.test.mjs`.

**Obj-3 — Validation backtest (B-GOV Obj-11 gate).**
- Run the checker over the last ~15–20 closed batches from git history. It MUST: pass known-good clean closes (zero false alarms) AND flag a known real gap (e.g. B3b's missing pre-audit). Tune thresholds (Item-2 floors) until BOTH reproduce.
- Langston manually verifies the dogfood result (B-GOV #6 self-governance circularity — don't trust the checker's self-PASS).

**GO-LIVE GATE (all three green):** seed confirmed (Obj-1) + shadow silent (Obj-2) + backtest passes (Obj-3) → set `GOV_SHADOW=0` + `systemctl enable --now governance-checker.timer` on staging → live `warning`-sev paging. Run one live tick, confirm no false flood, confirm a real gap pages. Then B-GOV-3 closes.

## Schedule / sequencing
- **Next governance batch** (near-term; small — 3 objectives). Owner OLD Claude (CC-A); Langston confirms Obj-1 dispositions + Obj-3 dogfood.
- Homed in: this scope; RUNNING_ISSUES (the B-GOV-2 calibration follow-ups consolidate here); `B_DISCORD_FOLLOWUPS_2026-06-20.md` item 8; POST_AUDIT_ROADMAP / PHASE_19_PLAN as a numbered item.
- **No open-ended "later" — this batch IS the schedule.** If it stalls, that's a visible stalled batch, not a vague intention.

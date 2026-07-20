# ACTIVE-PATH FLOW DOC — SCOPE-PREP (living input collection)

> **Owner:** Claude Analyst (CC-C), READ-ONLY (authors/commits docs; no code/batches). **Status:** PRE-SCOPE input collection. This is NOT the scope file yet — it accumulates the constraints agreed before I draft (1) the boundary one-pager and (2) the full scope. Langston refines the scope when I bring it; the boundary one-pager goes to him FIRST, in isolation, before any prose.
>
> **Origin:** Kyle directive 2026-07-21 — a living architectural map + documented END-TO-END FLOW of the ACTIVE TRADING PATH. The Phase-19 active-path audit (`1-system-manual/ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`) was a point-in-time snapshot at Phase-19 START; we keep finding what it missed + changing what it found, and nobody keeps the flow-architecture current. This DOCUMENTS the path (the end-of-Phase-19 RUNTIME audit PROVES it — Kyle wants both, separate). Supersedes the deferred exchange/futures research.

## THE MANDATE
- **Catch-up first:** reconstruct the CURRENT active-path flow (scan → IMF filters → signal orchestrator → SQE → RTB → TCL promotion → open gates → TEC exits → close) from ALL Phase-19 batch completion + progress reports, **verified against LIVE code/DB as the source of truth — NOT the completion reports** (the reports are the index of what to verify; they're the thing we keep finding gaps in — Langston).
- **Then monitor:** keep it current as each Phase-19 batch lands. CC-C owns it continuously through Phase-19.

## SCOPE GATES — settle BEFORE building (Langston, 2026-07-21)

### GATE 1 — BOUNDARY (bring Langston a one-pager on THIS first, in isolation; he rules before any prose)
- **Decision (both leans agree):** a TRAVERSAL, **not** a new System-Manual chapter. Manual/SIM are indexed by LAYER (per-component authority); the flow-doc is indexed by TIME / control-flow (one connected pass). Orthogonal axis, different job.
- **Form:** a STANDALONE doc that at each hop LINKS to the Manual chapter / SIM entry that owns that component, and owns nothing they own.
- **★ ACCEPTANCE TEST (Langston — the load-bearing word is "duplicates none," the hardest to hold):** the doc owns **EDGES ONLY** — the handoff (A→B) and **the state carried across it** — and **ZERO node internals.** The first time it restates a component's own logic "for the reader's convenience," it has become the 4th source of truth we're preventing. **If a hop needs internal depth, it LINKS; it never EXPLAINS.**

### GATE 2 — FRESHNESS (a detector, not just a header; fail-closed, sibling to the change-class checker)
- A "current as of `<sha>`" header ROTS unless something CHECKS it. The deliverable is the DETECTOR, not the header.
- **Direction:** a governance-pass check that, on any commit touching the ACTIVE-PATH FILE SET, verifies the flow-doc header's sha advanced in the same batch — flags fail-closed if code moved and the header didn't.
- **★ Two constraints (Langston, from the `poller.mjs:313` family of pain):**
  1. The active-path file set is a **COMMITTED MANIFEST, not a glob heuristic** — auditable, and edits to the set are themselves visible in the diff. Too broad → alert fatigue → someone silences it → **a silenced detector is worse than none.**
  2. The check reads the flow-doc header **AT THE GRADED REF (origin HEAD), not a worktree or the deploy clone** — else it false-flags on lag and false-passes on stale (the exact trap the existing checker already has).
- Open design piece: defining the active-path file set precisely (too broad = noise, too narrow = misses). Dovetails with the coord-tool hook thinking (B-CREW-COORD).

## LANDING-BATCH INPUTS (feed the doc as they close)
- CC-B's close-checklist now carries a one-line "flow-doc: X changed" per material Phase-19 landing (turns monitoring from archaeology into bookkeeping).
- Exit-path items landing as batches (CC-B, 2026-07-21) — the doc's exit section absorbs these:
  - **#548 / B8.5e** — per-symbol mark-staleness + LULD plausibility (replaces the one global 90s ceiling).
  - **#550 / B8.5g** — the 24h time-exit value is computed but never reaches the position → has never fired.
  - **#551** — dynamic open-trade management (we trail on price but never re-derive stop/target from current regime/vol).

## NEXT STEP
Draft **GATE-1 boundary one-pager** → Langston rules in isolation → then the full scope (with the GATE-2 freshness-detector spec + the file-set manifest) → Langston refines → catch-up build.

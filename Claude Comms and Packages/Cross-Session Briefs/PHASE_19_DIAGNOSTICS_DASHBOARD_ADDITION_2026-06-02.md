# Phase 19 — End-of-phase diagnostics dashboard addition (FYI for peer session)

**From:** CC session in active Kyle-facing conversation (2026-06-02).
**To:** any peer CC session reading governance.
**Type:** informational — heads-up, not a discussion request. Persisted to the cross-session-briefs folder per Kyle directive 2026-06-02.

---

## §1 — What was added

Kyle directive 2026-06-02 added a new operational sub-batch to Phase 19: **§19.6 — External Source Connection & Capacity Diagnostics Dashboard.** Slotted as the last operational sub-batch of Phase 19 (after SQE recalibration 19.4, observational decision gate 19.4.5, AMR if it lands here; before Phase 20 production hardening opens).

The full sub-section is in `1-system-manual/POST_AUDIT_ROADMAP.md` §19.6 with sub-sections 19.6.1–19.6.5. Short summary:

- **19.6.1 External-Source Connection Dashboard** — per-source rows (Kraken WS/REST channels, CoinGecko, Finnhub, any future feed), per-category status using a four-tier green / yellow / orange / red traffic-light system. Two checks per category: (1) is data flowing (freshness vs expected cadence) and (2) does the data look right (per-category sanity baselines stored as DB-tunable constants — NOT exhaustive per-pair validation). API-limit pane per source AND DawnTrader-wide aggregate throughput.
- **19.6.2 CPU / Process Capacity Dashboard** — every major process (scanners, archivers, VTS runner, active-trading orchestrator when Phase 19 reactivates it, TEC, session-lifecycle controller, system-alerts dispatcher, DB pool, ML sidecar when it lands) with running/CPU%/memory/queue-depth + same traffic-light status against per-process capacity envelopes.
- **19.6.3 Alert integration** — yellow→orange or orange→red transitions write to `system-alerts.jsonl` (per CLAUDE.md §10.5), surfaced to whichever CC or Langston session is at the keyboard. Yellow alone does NOT fire alerts (would flood). Critical-during-RTH may push directly to Telegram.
- **19.6.4 Forward role** — the API surface this dashboard exposes (`/api/diagnostics/external-sources/...` and `/api/diagnostics/process-capacity/...`) becomes the same surface the ML conversational layer (M5 in `ML_DESIGN_PRELIMINARY_2026-05-21.md`) reads for "is everything healthy" answers. Not a Phase-19-only artifact.
- **19.6.5 Scope shape** — ~1 week batch, two React tabs, ~6 endpoints, baseline-range constants + per-process capacity envelopes in `module_constants` (DB-tunable per CLAUDE.md §5 #15), Tier-1 governance (scope + pre-audit + completion report). No new DB tables.

---

## §2 — Why this is a heads-up, not a discussion

This is Kyle-directed scope that lives in Phase 19, well after the current batch surface either session is touching. It's noted here so neither session is surprised when scope drafts reference §19.6 later, and so the diagnostic-API naming convention (`/api/diagnostics/external-sources/...` and `/api/diagnostics/process-capacity/...`) is on record before either session prototypes anything in that namespace.

No action required from the peer session. If you spot a dependency conflict with B79.0n.CONFIDENCE-CHAIN or any other in-flight workstream — particularly if some module_constants namespace collision risks the same constant-name space the diagnostics dashboard plans to use — please flag it by appending a §3 below. Otherwise, this stays informational.

— CC (Kyle session), 2026-06-02

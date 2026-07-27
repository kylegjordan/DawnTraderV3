# B-EXPLORATION-LANE-MARKER — PRE-AUDIT (Step 2)

change-class: non_architecture
**Owner:** Claude Analyst (CC-C) · Scope: `B_EXPLORATION_LANE_MARKER_SCOPE.md` (which also carried this analysis inline; split into this file per the workflow's Step-1/Step-2 doc convention). **Client-only, display-only.**

## SIM / System Manual consultation
- **SIM:** the pure paper trade adapter (`client/src/lib/paper-trade-adapter.ts`) maps trade metadata → the shared VTS OpenTrade/ClosedTrade shapes. The shared tables (`vts-open-trades-table.tsx`, `vts-closed-trades-table.tsx`) already expose default-OFF `extraHeaders`/`renderExtraCells` append props (B8.10). Adding `admissionBasis` to the adapter is a display-shape addition; no cross-cutting runtime state. (SIM banner added at close.)
- **System Manual:** N/A — display plumbing; no architecture/strategy/regime/filter/signal-pipeline/math change.

## Component census (§9.5 — who reads/writes the affected state)
- **`admissionBasis`** is WRITTEN server-side (`signal-orchestrator.ts`, `active-execution-engine.ts:2770`, `ready_to_buy_service.ts:1128`) into trade metadata and READ by `exploration-lane.ts`. It was NOT carried to the client by the adapter — the display gap this batch closes.
- **Paper Open tab** (`paper-open-trades-tab.tsx`) + **Closed tab** (`trade-history-tab.tsx`) mount the shared tables through the adapter. Both shared tables expose `extraHeaders`/`renderExtraCells`, **default OFF** — only the paper mounts pass them, so the VTS tabs are untouched (Langston Step-4 re-verified the props pre-exist; no shared-table internals change).

## Blast radius
Adapter: 2 optional type fields + 2 honest-null mappings. 2 tab files: pass the append props (Lane `<th>` + EXPL/em-dash cell). No shared-table internals change; VTS mounts unaffected. tsc-clean on all 3 files; `paper-trade-adapter.test.ts` 15/15 (honest-keys test passes — the new key is not a forbidden legacy key).

## Verification
§9.3 staging UI (both tabs) — reads existing stored `admissionBasis` on all rows, so no new trade needed. Confirmed post-deploy: ONDO EXPL on Open; UNI/LINK/AAVE/USELESS/NEAR/WLD EXPL on Closed; non-exploration rows em-dash.

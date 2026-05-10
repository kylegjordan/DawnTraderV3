# B79.0g review

## Q1-Q5 calls
Q1 (table strategy: A=new vs B=extend paper_sim_trades): A. Different lifecycle, different read patterns; ML pipeline reads on the closed-table shouldn't fight open-trade churn writes, and schemas can diverge cleanly without NULLable padding.
Q2 (sync model: A=write-through vs B=on-close snapshot): B. TEC trailing state already persists separately; on-close snapshot keeps DB writes proportional to trade count, not tick count — write-through would multiply writes by ratchet frequency.
Q3 (rehydrate: A=full-state-via-TEC-rejoin vs B=basic-shell+TEC-rebootstrap): A. Rebootstrapping TEC from current price loses ratcheted-stop history — that's a regression vs today's in-memory behavior, and the trade's risk envelope would silently widen on every restart.
Q4 (currently-open migration: A=bootstrap-snapshot vs B=accept-loss): A. Losing context on ~21 active VTS trades is unacceptable; bootstrap is one-shot defensive code, runs only when table empty AND map non-empty.
Q5 (close-time atomicity: A=single-transaction vs B=ordered-ops): A. (B) creates an orphan-row window on partial failure (INSERT succeeds, DELETE crashes → row in both tables). Transactional is the only consistent option.

## Concerns / Additions
- Q4 bootstrap MUST re-resolve asset_class via safeResolveAssetClass() at snapshot time, not blindly persist the current in-memory value. Any trade opened pre-B79.0f deploy may still carry the legacy bad asset_class; snapshotting blindly would freeze the wrong value into DB and defeat the whole point of persistence-at-open. Add as sub-objective under Obj 5.
- Q2=B assumes ALL mid-trade mutations to OpenVirtualTrade are covered by TEC's separate state table. Confirm in Step-2 pre-impl audit: grep for mutations to in-memory `openVirtualTrades` Map outside TEC paths. If any mutation (mode flip, regime tag refresh, sourcePool update) is NOT TEC-tracked, that field needs targeted write-through OR explicit acknowledgment that rehydrate restores the entry-time value.
- Obj 6 ("drop the patch from B79.0f"): scope §0 confirms no client-side patch was applied (resolver fix was server-side only). Clarify what is actually being removed — if nothing, drop Obj 6 to avoid a phantom verification step.
- Migration rollback script (§3 Added) — list explicitly: DROP TABLE vts_open_trades + revert vts-runner.ts to memory-only writes. Trivial under (A) path but completion-report governance needs the artifact named.

## Verdict
approved-with-revisions

## Ship recommendation
ship after Q4 asset_class re-resolution sub-objective added + Obj 6 clarified or dropped + rollback script named in §3

# B-PM-CLAUDE P4 PM CODEX — STEP 1 CHANGE LIST

**Scope commit:** `bb4adaa36`. **Review head:** the pushed head containing this change list. **Change class:** `sub_batch`. **Review requested from:** Coltrane during Codex shift.

## What is being reviewed

- `Claude Comms and Packages/Scope Files/B_PM_CLAUDE_P4_PM_CODEX_SCOPE.md` — the KD-62–64 scope amendment for the previously planned but unbuilt PM Codex increment.
- `.claude/memory/MEMORY_CC_A.md` — OLD Codex's current position now points at this increment and preserves the prior OLD work through the dated crew handover sheet.

## The decisions in this scope

1. This is a `sub_batch` of the existing B-PM-CLAUDE OBJ-4, not a duplicate PM batch.
2. Operational identity is `codex-pm`; alert identity is the separately required `pm-codex`, advisory-only.
3. Every brief build step is pushed and reviewed separately by Coltrane.
4. The Discord sender boundary is not selected from the brief's filename alone. The current repo has three Codex-era send paths; Step 2 must prove which process sees the PM folder before the sender map is placed.
5. A missing supported Codex conversation backup remains the already placed after-live gap `#1238`; this increment must not call the Claude transcript archive a Codex backup.
6. The batch cannot close before Kyle watches the PM Claude → PM Codex → PM Claude round trip.

## Evidence checked before dispatch

- System Impact Map: Session-Instruction Loading Estate, Transcript Archive, Discord Comms Fabric, B-CODEX-FAILOVER and alert actor registry.
- System Manual: zero relevant entries for PM Codex/crew-switch/alert actors/Codex send/transcript archive; positive control `strategy` returns 430 lines in the one-file population.
- Provenance: introducing commits `ae9b039a2`, `33fed96c4`, `dbcca4a9f`, `bac793f92`, `aba41a602`, `f17130187`, `f6227fd49`, `193a65b32`, `9a23a12ea`.
- Existing parent scope/pre-audit and KD-62–64 were re-read; P4 is planned but not implemented.

## Questions for Coltrane

1. Does `sub_batch` correctly classify this pulled-forward parent increment?
2. Is the Discord discrepancy correctly left for the Step-2 trace, or is there already a reviewed path PM Codex must use?
3. Does the scope preserve the no-deploy boundary for the PM alert actors while keeping `codex-pm` as the session actor?
4. Are any requirements from the build brief missing or weakened?

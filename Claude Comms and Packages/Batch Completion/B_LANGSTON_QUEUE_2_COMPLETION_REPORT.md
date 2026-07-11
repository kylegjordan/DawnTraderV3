# B-LANGSTON-QUEUE-2 — Completion Report

**Owner:** CC-A (Claude Old). **Date:** 2026-07-11. **change-class:** hotfix (comms-infra rapid fixes under Kyle "do it now"; small blast radius, no new architecture, no strategy/regime/signal-pipeline/math change — the poster-child for the hotfix category. Checker requires only changes_and_fixes for hotfix, which FIX-2026-07-11 satisfies; class declared in `B_LANGSTON_QUEUE_2_SCOPE.md` (`change-class: hotfix`, the `readDeclaredClass` path). **Alert-clearing note (code-verified 2026-07-11):** this batch has no in-repo code commit → it is OUT of the checker's grading window → `decideAlerts` never consults the class, so the doc-gap alerts cleared through the orphan-sweep instead: `scope` on file-presence, `sim` via a real SIM Discord-Comms-Fabric hardening entry, `system_manual`+`pre_audit` via na-skip rows, and the stranded `classundeclared` orphan by manual CLI resolve. The GOVERNANCE_EXCEPTIONS `class-override` row is INERT (documented, #464); CC-B owns the structural class-aware `verifyDoc` fix.).
**Directive:** Kyle 2026-07-11 — *"Whatever is left to close out this governance batch… fix it and finish it now. Don't schedule shit for a day later. Do it now."* Executed same-session, deployed + verified live.

**Files (NOT in the CI'd repo — live at `/opt/discord-bridges/` on Helsinki `204.168.141.77`):** `langston_queue.py`, `discord-langston-bridge.py`. Backups on the box: `*.pre-BLQ2-<ts>` and `*.pre-OBJ5-<ts>`.

---

## Objectives — checklist with evidence

| Obj | Result | Evidence |
|---|---|---|
| **OBJ-0** ghost-bridge singleton guard (#496) | ✅ YES | `discord-langston-bridge.py` gets REAL `argparse` (`--help` prints usage + EXITS; unknown flags error) + an **abstract-UNIX-socket singleton** — a 2nd instance's `bind()` fails EADDRINUSE → it refuses to start. Cross-user namespace (catches a **root** ghost vs the **langston** bridge); auto-releases on death; held in `_SINGLETON_SOCK` global. **LIVE:** journal shows `singleton lock acquired (abstract socket) pid=… uid=999`; exactly **1** process. This is the guard Kyle named. |
| **OBJ-1** delete the `[:500]` truncation (#488) | ✅ YES | `new_item`'s `(summary or "")[:500]` → `(summary or "")`. Langston signed off 2026-07-10 + 2026-07-11. **Acceptance:** a 1200-char summary is stored whole. This is what parked the two review items Kyle surfaced (truncated → Langston couldn't complete the review). |
| **OBJ-2** unknown-id fail-loud (#482) | ✅ YES | The main marker-application site now has an `elif action == "unknown-id"` branch: a verdict for a missing id is LOGGED (recoverable) + surfaced, never dropped (it was computed and never read before — a real verdict was eaten 2026-07-10). Langston verified the string matches `apply_marker`'s literal return. Kyle-facing text is plain-language (his Step-4 nit). |
| **OBJ-3** move-not-delete (#489, DATA-LOSS) | ✅ YES | `save_queue` NEVER deletes: terminal items beyond `keep_done` are APPENDED to `<path>.archive.jsonl` + `fsync`'d BEFORE the live file is replaced; every eviction logged by id; forensic instrument removed; the "oldest" docstring lie corrected to "least-recently-touched." **Acceptance (real Linux fs):** 26 terminal → 20 live + 6 archived, **0 lost incl. the "STOP. the twelfth error is live" verdict.** |
| **OBJ-5** the lock (#495) | ✅ YES | `save_queue` is atomic (temp + fsync + `os.replace`) and lock-serialized; **all SIX mutation callsites migrated** to hold `queue_lock` across load→mutate→save (Langston's Step-4 catch: the primitive alone left the TOCTOU open). Caught + fixed a self-deadlock (`_self_advance`'s saves must pass `_locked=True` since it runs under the caller's lock). **Acceptance (real Linux flock):** save-under-held-lock returns cleanly (no deadlock); a live round-trip (Langston "bridge ok") went through the locked path with no loss. |
| **OBJ-4** contradictory-verdict guard (#401) | ✅ YES | apply_marker now guards TERMINAL_STATES: a second, DIFFERING verdict on a settled item (done/noop/error) returns dup-terminal WITHOUT mutating — only an explicit ready un-park may leave a terminal state. The bridge logs it always, surfaces to Kyle only on a genuine contradiction. Tests (box python): contradictory blocked-on-done -> dup-terminal (state unchanged); idempotent repeat; normal settle + ready un-park unaffected. |

## Verification (outcomes-based, LIVE)
- Deployed to the live bridge (stop → back up → swap → restart). Singleton acquired, gateway connected, exactly one process.
- **End-to-end round-trip verified:** addressed Langston, he replied "bridge ok" — a real message traversed enqueue → apply_marker → save-under-`queue_lock` with no deadlock and no loss.
- Queue integrity after live locked saves: valid JSON, 49 items, the "STOP" verdict still present, no spurious eviction.
- Acceptance tests on real Linux flock: OBJ-1 whole-summary, OBJ-3 0-lost move-not-delete, OBJ-5 no-deadlock.

## Langston review
- Step-4: OBJ-0/1/2/3 APPROVED as-read; **OBJ-5 gap caught** (primitive built, callers not migrated — TOCTOU still open) + an OBJ-2 plain-language nit. Both addressed: all 6 callsites migrated, self-deadlock fixed, Kyle-facing text de-jargoned. Disposition 1 (migrate now) taken per Kyle's no-defer directive.

## Issues resolved
#496 (ghost/singleton), #488 (truncation), #482 (unknown-id), #489 (DATA-LOSS move-not-delete), #495 (lock/TOCTOU). #401 (contradictory-verdict guard, OBJ-4).

## Governance files changed
BATCH_CATALOG (this row), PHASE_HISTORY (plain-language entry), RUNNING_ISSUES (#496/#488/#482/#489/#495/#401 all resolved), CHANGES_AND_FIXES (FIX-2026-07-11), SIM (Discord Comms Fabric — the bridge's queue-lock + singleton + move-not-delete), MEMORY_CC_A + Langston MEMORY, this report. SYSTEM_MANUAL N/A (comms infra, SIM-scope).

## Note — re-send obligations now unblocked
OBJ-1 (truncation) being live means the two truncation-parked review items (`…774019` B-STORAGE-HARDEN Step-8; `…762880` P19-B8.3c A–N list) can now be re-sent in full for Langston's verdict, per his two 2026-07-11 conditions (re-send after the truncation fix; reconcile against then-current HEAD). Tracked; re-send is a follow-up, not part of this code batch.

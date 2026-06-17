# BATCH B-GOV — Step-2 Pre-Implementation Audit (2026-06-17)

> Owner: Claude Old (CC-A). Companion to `BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` (Step-1 CLOSED). For Langston Step-2 review. NOT committed — coordinate with CC-B before any commit (§6).

---

## 1. EMPIRICAL FINDINGS (the data the design asked for)

### 1.a — Code-push → governance-push gap (validates the 4h deadline, R1)
Measured over the last 200 commits on `migration/aws-supabase`, grouping by batch-id, gap = last code-bearing commit → latest governance-bearing commit (governance = touches `1-system-manual/` or `Claude Comms and Packages/Batch Completion/`):

| metric | value |
|---|---|
| batches measured (had both code + governance) | 13 |
| median gap | **0.2 h** |
| p90 gap | **0.6 h** |
| max gap | **2.1 h** (B-5.1) |
| gap ≤ 4h | **13 / 13 (100%)** |

**Conclusion: 4h is empirically safe with large margin** — the slowest real close was 2.1h, p90 ≈ 36 min. 4h would NOT have false-alarmed on any of the last 13 batches. (We could go as low as 3h and still clear the 2.1h max, but 4h keeps margin for an occasional slower legitimate close; the open-state valve covers anything genuinely longer.) This confirms Kyle's "most close within a few hours" with data, per Langston's Step-2 ask. *Caveat:* a governance commit that didn't carry the batch-id tag isn't attributed to its batch — see 1.b — so true gaps are if anything even smaller (most batches showed code+gov in the SAME commit).

### 1.b — Batch-id tagging rate (confirms Obj-9 is load-bearing and currently weak)
Of the last 200 commits, **136 (68%) carry a parseable batch-id; 64 (32%) do not.** The checker keys everything off this tag (Obj-1/2). 32% untagged today = the linchpin is real and currently under-disciplined. Implications:
- **Obj-9 (formalize the tag convention) is not optional polish — it's a prerequisite.** Without ~100% tagging the checker either misses batches (tag absent) or can't attribute governance to them.
- The checker's **"untagged push" flag (Obj-1)** will fire often at first — useful pressure to fix the discipline, but must be LOW-severity and rate-limited so it doesn't flood the queue (Hole #4) while the convention beds in.
- **Step-3 task:** characterize the 64 untagged commits (are they governance follow-ups that belong to a batch but dropped the tag, side-work, or merges?) so the convention's required-position rule covers the real cases.

### 1.b.i — Untagged-commit triage (DONE — Langston Q2, run 2026-06-17)
Triaged the 64 untagged commits by files touched:

| bucket | count | meaning |
|---|---|---|
| code-only | 4 | **all 4 are "B-NAMES" / "B-NAMES.1"** — a REAL batch my numeric regex missed (letter-named) |
| mixed code+gov | 1 | also "B-NAMES" |
| gov/comms-only | 33 | B-GOV design rounds, Kyle directives, cross-session briefs — legitimately NOT code batches |
| merge | 0 | — |
| config/other | 26 | MEMORY.md + CLAUDE.md housekeeping commits — legitimately not code batches |

**Key finding: the real live blind spot is ~0, not 32%.** All 5 code-touching "untagged" commits are actually the B-NAMES batch — a parser miss, not a discipline miss. The 68% tagging rate UNDERSTATES discipline because (a) the regex didn't cover **alpha batch-ids** (B-NAMES, B-GOV, B-NEW-NN) and (b) MEMORY/CLAUDE/cross-session-brief housekeeping commits legitimately carry no code-batch tag. **Two Obj-9 consequences:** (1) the checker's tag parser MUST recognize alpha/letter batch-ids, not just `P19-B\d`; (2) the convention must EXEMPT pure-housekeeping commits (MEMORY-only, CLAUDE-only, cross-session-brief-only) from "needs a batch tag" — they are not code pushes and must not trip the untagged-code flag. With those two, the untagged-code blind spot is essentially closed.

---

## 2. SIM CONSULTATION + INTEGRATION POINTS + BLAST RADIUS

**B-GOV is almost entirely NEW infrastructure; it does NOT touch the trading pipeline.** Blast radius on trading = **zero** (no strategy/regime/signal/execution code). The integration surface is the alert subsystem and the comms path, both reused:

- **Writes into the existing alert queue (SIM §"Alerting path", line ~706):** the checker emits gaps via `addAlert()` and clears them via `resolveAlert()` in `server/services/system-alerts.ts`. State machine already exists: `scheduled → active → acknowledged → resolved` (`system-alerts.ts:45`). The dispatcher already (a) auto-pushes active alerts to Telegram (B-NEW-45) and (b) auto-invokes Langston via SSH (B-NEW-46), and §10.5 readers surface them every turn. **The checker reuses this entire pipeline — it does not build its own alert/notify path.**
- **ONE schema change:** add `'governance'` to the `AlertCategory` union (`system-alerts.ts:46`). Additive, no migration (the queue is a JSONL append log, not a DB table).
- **dedupe_key (already in the schema):** the checker keys each gap's `dedupe_key` to `(batch-id, gap-type)` so a given gap fires once and re-fires only on a new occurrence — prevents the every-tick flood (Hole #4).
- **Resolve-on-verified-state (Obj-13):** the checker does NOT auto-resolve on a tag-matched event; on any governance-bearing push (and on its own timer tick) it re-runs the mechanical check for ALL open batch-ids against current branch state and calls `resolveAlert()` only when the gap is genuinely gone.
- **Comms path reuse:** AMBER routes to Langston use the SAME SSH→`claude -p` file-first dispatch we already use (§6.5), not a new channel — sidesteps the Telegram bot-to-bot block.
- **Reads:** git history (via `git fetch` against the existing checkout / GitHub API), the governance docs, the pre-audit docs. All read-only.

**SIM update required at Step-10:** a new component entry for the governance-checker (its own process, its inputs = git history + governance docs, its outputs = `governance`-category alerts + Langston dispatches + the in-repo exception/open-state audit records, its cross-cutting dependency = the alert queue). System Manual: N/A (no architecture/strategy/regime/filter/signal/math change) — flagged here explicitly per §9.4 applicability judgment.

## 3. CHANGE-CLASS → EXPECTED-DOC-SET CONFIG (draft, validated vs CLAUDE.md §3)

Each doc per class = **REQUIRED** (absence = RED) / **CONDITIONAL(predicate)** (absence = at most a low-sev Langston-route) / **N/A-allowed**. Class is DECLARED in the scope header (Obj-9); undeclared → strictest (architecture).

**architecture / full-batch** — REQUIRED: scope, pre-audit, completion report, BATCH_CATALOG, PHASE_HISTORY, MEMORY (both files §3.1), PHASE_19_PLAN (while §3 temp rule live), **SYSTEM_MANUAL (content)**, **SIM (content)**. CONDITIONAL: CHANGES_AND_FIXES (iff bug/risk surfaced), ADJUSTMENT_FRAMEWORK (iff param-gov change), RUNNING_ISSUES (iff issue surfaced/closed), POST_AUDIT_ROADMAP (iff roadmap change), AUTHORITY_BASELINE (iff constitutional), MULTI_ASSET_VTS_EXPANSION_PLAN (iff xStock-calibration arc), ASSET_CLASS_ONBOARDING_WORKFLOW (iff onboarding learning), CLAUDE.md (iff stable-rule change).

**non-architecture batch** (display / data-quality / observability) — REQUIRED: scope, pre-audit, completion report, BATCH_CATALOG, PHASE_HISTORY, MEMORY, PHASE_19_PLAN, **SIM content IFF a component/cross-cutting-state changed** (judge — usually yes for a real batch). SYSTEM_MANUAL: N/A unless it touches architecture/strategy/regime/filter/signal/math. CONDITIONAL: same Tier-2 set.

**sub-batch** — REQUIRED: completion report (or appended note), BATCH_CATALOG, PHASE_HISTORY, MEMORY, PHASE_19_PLAN status board. **SYSTEM_MANUAL/SIM content REQUIRED IFF arch-changing** (§16 — a sub-batch IS a batch for content-update purposes; the P19-B4b D5 miss). pre-audit: CONDITIONAL (required iff non-trivial). Belongs to an umbrella namespace if declared (R2).

**hotfix** — REQUIRED: CHANGES_AND_FIXES, completion note, MEMORY. pre-audit: N/A-allowed. **AUTO-BUMP to sub-batch/batch** if it adds/removes a file, adds a migration, touches > ~3–5 files, or hits architecture/strategy/regime/filter/signal/math paths (the Obj-12 path heuristic feeds this).

*Floors (Item 2) are per-(class × doc) and derived empirically in Step-3 from the last ~10 clean closes' content deltas; AMBER ≈ 40–50% of observed median per doc-type.*

## 4. BOT HOST DESIGN (Item 4 — systemd timer poller, NOT a daemon)

- **Home:** Hetzner (`204.168.141.77`, the Langston box), as its **own systemd unit + timer** — isolated from the dawntrader node event loop (avoids the `proj_cron_eventloop_misses` same-PID stall) and NOT a `while true` loop (the §18 54-day watch-loop that wedged the box). Tick interval ≈ every 15–30 min (4h deadline doesn't need finer).
- **Each tick (stateless-by-construction → restart-safe, Obj-8):** `git fetch` (or GitHub API since-last-SHA) → read persisted open-batch state from disk → classify new commits (code / governance by path; batch-id by tag) → update per-id timers + open/umbrella state → run mechanical checks → open/resolve `governance` alerts → write back state → exit.
- **Self-heartbeat:** writes a last-tick timestamp; emits a LOW-sev dead-man alert if it misses its own interval (an always-on watcher with no heartbeat is worse than nothing).
- **Force-push safety (Hole #8):** detect non-fast-forward on fetch → re-baseline + alert "history rewrite."
- **Source of truth = GitHub `migration/aws-supabase`, full stop (Hole #9):** an unpushed GDrive-only doc reads as missing = correct by design (unpushed ≠ done).
- CI-on-push rejected as sole host (stateless, can't hold the 4h window); the poller covers push-detection too. One poller, lean.

## 5. SELF-DECLARED-INPUT AUDIT TREATMENT (Langston's cross-cutting note)

Four self-declared inputs now: **batch-id tag, change-class, open-batch state, umbrella-namespace claim.** Each gets the SAME treatment: (a) **auditable in-repo record** (a `GOVERNANCE_EXCEPTIONS.md` / declarations log, greppable independent of the queue); (b) **strict default when undeclared** (no tag → "untagged, can't govern" flag; no class → strictest; not declared open → on the 4h clock; no umbrella claim → treated as independent sibling); (c) **a cheap cross-check heuristic** (Obj-12 path heuristic for class; "push under a done-declared umbrella" → flag; "code quiet + not-open + no governance" → the 4h alarm itself). The strict-default everywhere makes forgetting-to-declare the *noisy* failure, never the silent one.

## 6. BACKTEST / CALIBRATION GATE (Obj-11 — Step-3 hard gate, designed here)
Replay the checker over the last ~15–20 closed batches from git history. **PASS condition (both required):** (1) it raises NO false gap on known-good clean closes; (2) it correctly flags **B3b's known missing pre-audit**. The gap-distribution measurement (§1.a) is the deadline half of this; the doc-presence/emptiness replay is the other half. Thresholds (the Item-2 floors) are tuned here. **If both don't reproduce cleanly, the checker does not ship.** (Note: the wall-clock deadline itself can't be replayed from git, but the gap distribution + the doc-presence checks can.)

## 7. OPEN QUESTIONS FOR LANGSTON STEP-2 REVIEW
1. **Class config (§3):** does the REQUIRED/CONDITIONAL split match how you actually review? Any doc mis-bucketed?
2. **Untagged-commit characterization (§1.b):** before Step-3, do you want the 64 untagged commits triaged, or is "formalize the convention + low-sev flag" enough to start?
3. **Poller tick interval (§4):** 15 vs 30 min — any preference given the 4h window + box load?
4. **GOVERNANCE_EXCEPTIONS.md vs append-to-CHANGES_AND_FIXES** for the declarations/exception audit trail (§5) — your call on the home.
5. **Anything in the SIM integration (§2) you'd verify differently** before Step-3.

**STATUS:** Step-2 pre-audit drafted. Awaiting Langston Step-2 review → then Step-3 build (poller + config + backtest gate + the CLAUDE.md narrative-strip sub-batch). NOT committed; coordinate with CC-B.

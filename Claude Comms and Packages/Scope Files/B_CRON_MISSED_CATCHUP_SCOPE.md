# B-CRON-MISSED-CATCHUP — SCOPE

change-class: architecture

**Batch:** `B-CRON-MISSED-CATCHUP` · **Issue:** `#691` · **Owner:** CC-C / ANALYST Codex · **Reviewer:** Coltrane for this Codex shift · **Plan position:** `SPRINT_TO_LIVE_PLAN` pre-sprint stage 3, item 7, immediately after the now-closed `B-XSTOCK-SNAPSHOT-RETENTION`.

## 0. Directive, outcome and boundary

Two independent runtime events have made node-cron silently discard work: a wall-clock step and an event loop blocked across the scheduled second. The batch adds a governed recovery contract to the existing node-cron registry so each recoverable missed occurrence is durably identified, admitted at most once, executed through the same job core as a normal fire, and recorded against the true scheduled boundary.

This is `architecture` because it changes the cross-cutting execution contract of all six production node-cron schedules, extends the central registry from observation to recovery, and makes the fire-evidence store carry durable per-occurrence decisions. It does not change any job's business purpose, cadence, trading setting, formula, xStock universe rules, awareness logic, feed-health thresholds, or Q-D metrics.

The finished contract is deliberately narrower than “replay everything”:

1. a missed occurrence is a durable identity: `(job name, scheduled boundary)`;
2. only one runner may acquire that identity, even if the library emits the event twice or the process sees a normal/missed race;
3. recovery runs are serialized per job and respect the job's existing overlap rules;
4. a job may run late only when its inputs and side effects still make that run honest;
5. an occurrence that is too old, unreconstructable, unsafe to repeat, or left indeterminate by a crash is recorded and alerted rather than silently fabricated or blindly retried; and
6. verification uses deterministic injected misses on staging. It does not change the host clock, wait for a natural multi-day miss, or block unrelated deployments.

## 1. Objectives and verification

### OBJ-1 — Make the registry own the true occurrence identity

Extend the central node-cron registration contract with one named per-occurrence runner shared by the normal callback and recovery path. A normal fire takes its scheduled boundary from node-cron's task context. A missed event reconstructs the boundary the library skipped, not the next boundary carried in the event.

The installed node-cron 4.2.1 runner logs the current `expectedNextExecution`, advances it with `getNextMatch`, and only then calls `onMissedExecution`; the inline task emits that advanced date as `execution:missed`. Therefore the recovery boundary must be derived as the previous calendar occurrence of the event date through the existing calendar-aware helper, then validated against the job expression and timezone before any work is admitted.

**Verified by:**

- a source fence pins the installed dependency behavior and fails if missed-event ordering changes;
- fixtures cover a wall-clock step, an event-loop stall at the scheduled second, one missed occurrence, several consecutive missed occurrences, UTC and non-UTC schedules, and invalid expressions;
- every reconstructed boundary is an exact schedule match and is strictly earlier than the library's event date;
- a mutation that uses the event date directly fails because it assigns the next occurrence, not the missed one;
- all six normal callbacks write the actual schedule boundary into `scheduled_for` while retaining their real callback-start time in `fired_at`.

### OBJ-2 — Durably claim one recovery attempt per job and boundary

Before calling any job core, recovery must atomically claim the `(job name, scheduled boundary)` identity in durable storage. The record must distinguish decision, claim, start, completion, failure, skip and indeterminate states; carry trigger source `missed_catchup`; retain actual start/end time, lag, policy version and reason; and prevent a second process, duplicate event or normal/missed race from starting the same occurrence again.

The audit write that follows ordinary work remains failure-safe. The recovery **claim** is different: if durable admission cannot be proved, no catch-up side effect runs. Step 2 must choose the smallest schema/index shape that makes this atomic and must classify each job's crash boundary. Automatic retry is allowed only where the job's own downstream operation is proven idempotent; otherwise an acquired-but-unfinished occurrence becomes `indeterminate` and raises a manual decision alert rather than risking duplicate external work.

**Verified by:**

- concurrent claim tests admit exactly one runner from at least two contenders for the same identity;
- duplicate missed events, a process restart, and a normal/missed race produce one admitted attempt and one terminal durable decision;
- a database-write refusal before the claim produces no job side effect;
- crash injection before claim, after claim/before work, during work, and after work/before terminal write proves the reviewed retry or indeterminate rule for each boundary;
- the database enforces the identity independently of in-memory locks, and a mutation that removes that enforcement admits a duplicate and fails;
- existing ordinary success/error evidence remains readable by the Formula Health and stale-fire consumers.

### OBJ-3 — Serialize recovery and bound unsafe backlog

Use a per-job FIFO recovery queue so missed occurrences cannot overlap each other or a still-running normal fire. Step 2 must produce a six-job side-effect and freshness matrix and set an explicit maximum recoverable age/backlog for each job. The default is fail closed: if scheduled-time inputs cannot be reconstructed honestly, record `skipped` with the exact reason and alert; do not write current data into a historical bucket.

This is load-bearing for the Q-D probe, whose scheduled time defines its storage bucket while its inputs are current snapshots; an old replay could otherwise place today's book in yesterday's bucket. It is also load-bearing for the universe discovery job, which is external-provider and rate-limit heavy, and for formula/awareness jobs whose repeated side effects are not automatically interchangeable with one delayed current-state run.

**Verified by:**

- a Step-2 matrix covers formula audit, feed integrity, awareness state, awareness reflection, Q-D probe and universe discovery, naming each job's data clock, side effects, idempotency, overlap rule, maximum age/backlog and skip reason;
- several missed events for one job run in boundary order with no overlap and no thundering herd; different jobs may proceed independently within their reviewed limits;
- an old Q-D occurrence never writes current snapshots into an old bucket; a mutation that does so fails;
- universe discovery cannot launch parallel provider sweeps or exceed its reviewed backlog cap;
- every skipped occurrence remains visible as a durable decision and cannot masquerade as success.

### OBJ-4 — Wire all six schedules without changing their purpose

Move each current callback's work into a reusable per-occurrence core and register it with the recovery-capable registry. Preserve the current cadence, enablement, timezone, jitter, `noOverlap`, job-specific audit metadata and error handling.

The production population at Step 1 is exactly six `cron.schedule` calls:

| registered job | current cadence | purpose preserved | recovery-specific constraint |
|---|---|---|---|
| `formula_audit_cron` | daily 03:00 UTC by default | run the formula integrity audit and publish its counts | delayed current-state audit must be labeled; no duplicate alert/report side effects |
| `feed_integrity_cron` | every 5 minutes by default | run the sole feed-health check after jitter | catch-up must not stack with the next natural check or create a burst |
| `awareness_state_update_cron` | hourly | update awareness state | serialize with the boot update and natural fire |
| `awareness_reflection_cron` | every 6 hours | run deep reflection | serialize and prevent repeated reflection side effects |
| `xstock_qd_probe_cron` | configured cadence, currently 5 minutes | capture current xStock quote/depth friction | never fabricate historical telemetry; preserve existing `noOverlap` |
| `xstock_universe_discovery_cron` | daily 06:00 UTC | refresh the dynamic xStock universe | no parallel/backlog provider sweeps; preserve discovery-run evidence |

**Verified by:**

- a compile-driven registration census finds exactly the six production sites and each supplies a recovery runner and policy;
- existing job-specific suites remain green and new tests prove normal cron behavior is unchanged;
- callback context, jitter, enablement, timezone, configured Q-D cadence and Q-D `noOverlap` survive the refactor;
- formula result counts, Q-D coverage metadata and discovery-run evidence remain present on both natural and eligible catch-up attempts;
- a seventh ungoverned `cron.schedule` site fails the census test.

### OBJ-5 — Make stale-fire alert recovery truthful

The cadence-aware verifier already keys a `cron_stale` alert to a specific job and expected occurrence, but its body promises automatic clearing on the next successful fire and no code performs that resolve. Implement a terminal, evidence-bound resolve for the exact stale occurrence when that occurrence is successfully recovered or a later natural fire supplies the contractually accepted recovery evidence. If the reviewed policy decides a later fire is not sufficient, correct the body and keep the earlier occurrence open until its own disposition is recorded.

The separate `cron_verifier_blind` alert is explicitly manual-only after a confirmed history-read recovery. This batch must not acknowledge, auto-resolve, re-key or otherwise weaken it.

**Verified by:**

- an exact successful catch-up resolves only the matching `cron_stale:<job>:<occurrence>` row with evidence tied to the durable recovery result;
- a failed, skipped or indeterminate catch-up leaves the stale alert active and emits the appropriate recovery-failure evidence;
- a different job or different occurrence cannot resolve the row;
- the chosen next-natural-fire rule and every alert sentence agree;
- tests prove `cron_verifier_blind` remains manual-only and unchanged.

### OBJ-6 — Preserve consumers while making schedule truth observable

Keep the existing fire-evidence verifier, boot smoke test, Formula Health reader and System Alerts behavior compatible while correcting the long-standing `scheduled_for = fired_at` misuse. Audit rows must state the true schedule boundary, actual start, trigger source, duration, result and recovery decision without making consumers count a skip/claim as a successful fire.

**Verified by:**

- a current-row positive control and post-deploy read show true boundary timestamps on new natural and catch-up rows while legacy rows remain readable;
- the verifier recognizes a successful catch-up for the exact missed occurrence and does not treat claim/skip rows as successful fire evidence;
- Formula Health still reads the latest completed formula result and does not select a non-terminal recovery row;
- boot smoke, next-fire calculation, alert deduplication and query-failure behavior retain their existing tests;
- audit-write failure after ordinary work remains observable without retroactively failing the job, while claim failure still prevents recovery work.

### OBJ-7 — Prove recovery deterministically on staging without blocking the crew

Build a safe exact-ref harness that drives the real registry/admission/audit path with controlled fake jobs and injected missed contexts. Use it after deployment to prove one ordinary fire, one eligible catch-up, one duplicate refusal, one overlap/queue case, one too-old skip, one catch-up failure and one stale-alert resolution. No production job's destructive or external side effect is invoked by the harness.

**Verified by:**

- TypeScript Check, Test Suite, Build and Docker Build pass individually at the deployed ref;
- the staging harness records exact identities and expected terminal states, and a read-back reconciles every injected event to one durable decision;
- a real six-job registration/arm census remains healthy after deploy;
- the app logs contain no unhandled recovery error, duplicate execution or unexpected restart;
- no host clock is changed, no natural multi-day observation window is required, and the batch does not hold unrelated reviewed deployments;
- this is a server-side scheduling batch with no user-facing staging screen; UI is **N/A**, not represented as checked.

## 2. Architectural read

### System Impact Map

The System Impact Map's B-NEW-49 node-cron layer defines the current central topology: every schedule registers in `cronRegistry`, emits arm evidence, writes `scheduled_tasks_audit`, and is checked by an independent 15-minute fire verifier. The registry currently holds observation metadata and the task handle only; it does not hold a runnable callback, missed-event listener, per-occurrence identity, queue or recovery decision. This batch extends that one central layer rather than adding six independent listeners.

The xStock universe map shows that the daily job launches the full three-source discovery and updates the live xStock universe; the blast radius is high for a duplicate or backlog burst. The Q-D map defines an always-on capture-only probe whose current snapshots are written to a fire-grid bucket; that makes historical replay without historical inputs dishonest. The feed-integrity map defines the every-five-minute monitor as the sole feed-health alarm/grader, so recovery must preserve its cadence, jitter and alert behavior.

The System Impact Map also describes a separate in-app `scheduler-registry` based on interval timers. That component has its own duplicate-first-tick item and is not part of this batch. `B-CRON-MISSED-CATCHUP` applies only to the six node-cron jobs above.

### System Manual

The System Manual's scheduler chapter describes the separate interval-task registry and three jobs that own their own loops; it is not the recovery target. Its feed-integrity chapter confirms the five-minute monitor is the authoritative feed-health check. Its dynamic-universe chapter confirms the daily 06:00 UTC discovery refresh and manual on-demand route. Its scheduled-job evidence entry records the audit table's original forensic purpose; current consumers and row volume now make it a live cross-cutting contract that Step 10 must update.

The formula audit and awareness schedules predate the current governance architecture and have no complete modern System Manual contract of their own. Their exact current behavior and original purpose therefore come from their introducing commits, current code and the B-NEW-49 integration record; this scope does not invent a new business purpose for either.

### Current measured state and blast radius

At the Step-1 staging read on 2026-11-12T01:39:10.591Z, the audit store contained 94,849 fire rows across exactly six current node-cron job names: 47,189 feed-integrity, 42,750 Q-D probe, 3,933 awareness-state, 653 awareness-reflection, 162 formula-audit and 162 universe-discovery rows. All 94,849/94,849 rows had `scheduled_for = fired_at`, all 94,849 carried source `cron`, and the only indexes were the primary key plus `(task_name, status, fired_at DESC)`. Thus the true schedule boundary and durable per-occurrence uniqueness are both absent today.

Blast radius is **high for autonomous maintenance and evidence integrity, low for trading-decision logic**. A duplicate recovery can repeat alerts, reports, external discovery calls or state updates; an over-old Q-D replay can corrupt historical telemetry; a false refusal leaves one occurrence missed but visible. The design therefore chooses durable refusal over unproved execution.

## 3. Provenance read

### Corpora searched

Searched `BATCH_CATALOG`, completion reports and scopes, `RUNNING_ISSUES` (`#691`, duplicate `#1185`, and B-CRON-VERIFIER-QUERY-FAIL), the System Impact Map, the System Manual, current production code and tests, the installed node-cron 4.2.1 source, and `bridge/canonical/` for the pre-governance formula/awareness/feed terms. Repository-wide, non-path-limited `git log -S` histories were read for `RegisteredCronJob`, `WriteFireRowOptions`, `computePrevFire`, `registerFormulaAuditJob`, `registerXstockUniverseCron`, `initializeAwarenessScheduler`, `initFeedIntegrityAutoCheck`, and `runQdProbeOnce`. No former filename changed the identified introductions.

### Tier 1 — behavior this batch changes

#### Central node-cron registry, fire evidence and verifier

The central layer was introduced by `00945ddf84acada4bc9c37313c6c60b5b8de8f9b`, whose subject is verbatim:

> “B-NEW-49 — node-cron observability + deploy-state arming verification”

Its stated purpose was verbatim:

> “Adds the observability + safety-net layer for all 5 node-cron schedules in /server, preventing the BUG-2026-05-31-B silent-failure pattern from going undetected for days.”

The same commit says the other schedules “had zero observability” and explicitly describes the registry, arm logger, audit writer, boot smoke test and independent fire verifier. It did not claim recovery. The cadence-aware verifier followed at `c7529f146297a5a6c9775d9ddc886bebe1929dde`, verbatim:

> “Fix: NEW computePrevFire (cron-parser .prev()) so the verifier compares against the schedule's ACTUAL most-recent calendar occurrence”

**Disposition: (2) relevant but needs updating to today's intent.** Observation, calendar-aware occurrence calculation, audit evidence and alert deduplication remain correct. Issue `#691` proves detection alone is insufficient, so the central contract gains durable admission and recovery while preserving those controls.

#### Formula audit schedule

Introduced by `c491a6ff2f7a47932ba2cdc6670eb1e528089a8f`, whose message says verbatim:

> “Introduce a scheduled daily formula audit job, a manual trigger endpoint for administrators, and enhanced logging/alerting for formula deviations.”

**Disposition: (2) relevant but needs updating to today's intent.** The daily audit and manual route remain correct. Its scheduler wrapper must accept a true boundary and governed catch-up context, while its reports and alerts must not be duplicated blindly.

#### xStock universe discovery schedule

Introduced by `230348507648225d06a576bffc6c645095bd2610`, whose message says verbatim:

> “Daily 06:00 UTC cron registration on the same node-cron host as B-NEW-36 session-lifecycle controller per Langston Q8 ACK. Catches unhandled discovery throws + logs without server crash.”

**Disposition: (2) relevant but needs updating to today's intent.** The discovery job and failure isolation remain correct. Its wrapper needs durable missed-occurrence handling and a bounded policy that prevents parallel or stale backlog sweeps.

#### Awareness schedules

Introduced by `a7887c2e7957aba278cfd541678d23f6c3574271`, whose message says verbatim:

> “Initialize and start the awareness scheduler service, which handles hourly state updates and 6-hour reflections.”

**Disposition: (2) relevant but needs updating to today's intent.** Both purposes and cadences remain correct. Their wrappers need a shared occurrence runner and serialization with boot/natural work.

#### Feed-integrity schedule

Introduced by `b4ca15d6367d60e6e35372f7cd03562d3fdbcccc`, whose message says verbatim:

> “Implement comprehensive data feed integrity monitoring with reconnect tracking, uptime calculations, and configurable thresholds.”

**Disposition: (2) relevant but needs updating to today's intent.** The monitor and thresholds remain correct. Its wrapper needs true schedule provenance and a catch-up policy that preserves jitter without stacking checks.

#### Q-D probe schedule

Introduced by `dc8350110520ba5eacb27dfd746ba3cb494e1034`, whose message says verbatim:

> “NEW always-on every-5-min probe records a compact DERIVED on-venue friction row per active xStock symbol (bid/ask spread + top-of-book depth + freshness) into NEW table xstock_qd_probe_history”

and:

> “CAPTURE-ONLY (nothing consumes it; friction-extraction -> B81/Phase-25).”

**Disposition: (2) relevant but needs updating to today's intent.** Current capture, deduplication and `noOverlap` are correct. The wrapper needs durable missed-occurrence decisions, but an old current-state replay must be skipped rather than written as historical capture.

### Tier 2 — components read or called, behavior preserved

| component | original/current intent | disposition |
|---|---|---|
| calendar-aware previous/next-fire helper | map a cron expression and timezone to real calendar occurrences, including non-uniform schedules | **(1) still relevant and correct** |
| node-cron arm logger and boot smoke test | prove schedules registered and have plausible next-fire state | **(1) still relevant and correct** |
| fire-evidence verifier query-failure path | refuse to judge schedules when the history read fails and raise a separate manual-recovery blindness alert | **(1) still relevant and correct** |
| Formula Health reader | show the latest completed formula-audit outcome from fire evidence | **(1) still relevant and correct; non-terminal recovery records must not become results** |
| system-alert dedup/resolve service | retain alert history while allowing an exact terminal resolve and later recurrence | **(1) still relevant and correct** |
| formula, feed-integrity, awareness, universe-discovery and Q-D inner work functions | perform the six jobs' existing business work | **(1) still relevant and correct; called through a new occurrence wrapper, not behaviorally redesigned** |
| separate interval-task `scheduler-registry` | run the application's non-node-cron interval tasks | **(1) still relevant and correct; explicitly outside this batch** |

## 4. Known limits carried into Step 2

1. “Exactly once” is enforceable for durable admission, but external side effects cannot be declared exactly-once across a process crash without each job's own idempotency proof. Step 2 must resolve that per job; uncertain work is indeterminate, not automatically replayed.
2. A missed event proves the scheduler skipped a boundary, not that historical inputs remain reconstructable. The policy may legitimately record a skip for Q-D or other stale work while still closing the scheduler defect through visible, bounded behavior.
3. The current fire-evidence table was designed as an append-only completion log. Step 2 must decide whether to extend it or add a narrow recovery ledger without making claims/skips look like successful fires.
4. No observation window is needed to establish the mechanism. Natural long-run monitoring may remain as a non-blocking follow-up, but Step 7 must close through the deterministic exact-ref staging proof plus the real six-job health census.

## 5. Step 10 implementation reconciliation (2026-11-12)

All seven approved objectives are implemented and GREEN against deployed runtime `4e66ea904edf690e144035c959cbd335241f7651`. The landed design follows the scope: all six production node-cron jobs enter one shared natural/missed occurrence runner and per-job lane; `(job_name, scheduled_for)` is durable and unique; the v1 six-job policy admits at most the newest honest missed boundary; prior-process work that started but did not terminalize becomes `indeterminate`; and only success for the exact boundary resolves that boundary's `cron_stale` row. `cron_verifier_blind` remains manual-only.

The implementation kept `scheduled_tasks_audit` as completed fire evidence for Formula Health and the cadence verifier, while `scheduled_job_occurrences` carries admission, policy decisions and crash truth. New rows preserve the true scheduled boundary separately from the actual start time. The exact-ref staging harness exercised 11 identities with the registered 6 succeeded / 3 skipped / 1 failed / 1 indeterminate distribution, seven executed-only audit rows and one core call for the natural/missed race; Coltrane independently reproduced that proof and the real six-job registration/arm census at evidence ref `bc945a098edb5a6d807c6696a6ef20678b4ed11e`.

No observation period remains. The scope deliberately chose deterministic exact-ref proof instead of changing the host clock or waiting for a natural multi-day miss; Step 9 passed all seven objectives and 70/70 focused tests. Known limits remain explicit: recovery is bounded current-state work, Q-D historical replay is refused, database admission failure runs no core, and after-start uncertainty requires a manual decision rather than automatic retry.

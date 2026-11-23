# B-UNIVERSE-REFRESH-ACTS — GATE C CODEX HANDOVER

**One gate only:** review the Gate C closure. Gates A and B already have Coltrane PROCEED verdicts at their exact refs; do not re-open them except for a concrete interaction introduced by this Gate C diff.

## Dispatch header

- **DECLARED CHANGE-CLASS:** `architecture`
- **DOC SET FOR `architecture`, row by row:**
  - `SCOPE` — present: `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md`
  - `PRE_AUDIT` — present: `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`
  - `COMPLETION_REPORT` — absent, due Step 11
  - `BATCH_CATALOG.md` — absent, due Step 10
  - `PHASE_HISTORY.md` — absent, due Step 10
  - `SYSTEM_MANUAL.md` — absent, due Step 10
  - `SYSTEM_IMPACT_MAP.md` — absent, due Step 10
  - `DELETED_COMPONENTS_LOG.md` — present; two entries rode the Step-3 commits
- **STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md`, PROCEED on r3 with C1-C3 (Discord `1574123287120846969`), folded at `257124874`.

## Prior gate state carried into this review

- **Gate A:** Coltrane PROCEED at `fecc618de9bdfa616a3984935767b4cec4437c7c` on 2026-11-23 22:30:31Z. The folded comment names both awaits between the running-set read and the decision.
- **Gate B:** Coltrane PROCEED at `bd4b0fa164a660da12707254db64f0191dd80ebb` on 2026-11-23 22:46:46Z. He independently ran the recorder, refresh and watchdog suites: 75/75.
- Those refs remain the reviewed objects. This Gate C ref is rebased on the current shared head; the Gate A/B changes are content-equivalent descendants, not a request to substitute new refs for the completed reviews.

## Gate C condition 1 — repeated add failure pages once and clears only on a clean handoff

File: `server/services/crypto-universe-refresh.ts`

- At the start of each recorded refresh, the settled incremental-add failures are taken from the recorder. The first run-row query now loads the two newest stored rows' `rejected_adds` and `unconfirmed_adds` alongside the refusal counter.
- `addFailureFlapSymbols` intersects the current failed symbols with each of those two rows. A symbol therefore qualifies only when the same add failed in three consecutive recorded refresh handoffs. The two stored rows make the streak survive a process restart.
- One aggregate warning uses dedupe key `crypto-universe-add-flap`; the row records the symbols at mint, run id, occurrence id and threshold.
- The row resolves only when the current handoff contains zero rejected and zero unconfirmed adds **and** this refresh reaches `applied` or `noop`. A refusal, a confirmed large-drop step, or another symbol's add failure does not clear it.
- Honest limit carried from Gate B: new-shard overflow adds use the open-time subscription path and are not in the tracked failure handoff. They are persisted separately as `untracked_overflow_adds`; they neither qualify for this streak nor get misreported as confirmed.

Tests in `server/tests/unit/b-universe-refresh-acts-refresh.test.ts`:

1. Pure discriminator: A fails in both stored rows and now; B fails in only one stored row and now; only A qualifies. With fewer than two stored rows, nothing qualifies.
2. Real alert store: the same rejected add is handed over on three successive runs; exactly one non-terminal row exists with the symbol and threshold. A following clean `noop` resolves that exact row under actor `crypto-universe-refresh`, transport `engine`, with the clean run id as the evidence token.

## Gate C condition 2 — the single-flight boundary is the shared occurrence runner

There is deliberately no second batch-local latch.

1. **Producer census:** the only production caller of `runCryptoUniverseRefresh` is the recovery callback in `server/services/crypto-universe-refresh-cron.ts`; the other caller is its unit-test helper. The cron callback routes natural fires through `runNatural`; the missed-event listener routes catch-up through `dispatchMissed`.
2. **One process:** `cron-occurrence-runner.ts` keeps one lane per job. `lane.draining` guards the drain and the loop awaits each scheduled item before shifting the next. Natural and missed occurrences for `crypto_universe_refresh_cron` therefore cannot overlap in one app process.
3. **Across processes:** `PgOccurrenceStore.withJobLock` acquires a database advisory lock keyed by the job name and holds it until its callback returns. `executeScheduled` invokes the job's sole `recovery.run` inside that callback. A second app process receives `acquired:false`, waits, then re-enters the claim/duplicate decision; it does not run the refresh concurrently.
4. **No bypass:** tree-wide production census finds exactly one `recovery.run(` call, the call inside that locked scheduled execution. Registration itself is idempotent through `_cronTask`.

The existing occurrence-runner tests own that shared mechanism. Gate C adds no weaker source-text latch beside it.

## Gate C condition 3 — the crypto capture switch owns the refresh

File: `server/startup/passive-archive-bootstrap.ts`

- Bootstrap reads `b74_crypto_capture_enabled` into `cryptoEnabled`.
- Only the `if (cryptoEnabled)` arm calls `startCryptoSpotArchiver`; the same promise chain registers `registerCryptoUniverseRefreshCron` only after the start attempt settles.
- The false arm calls neither function. The refresh therefore cannot start the recorder while the operator has crypto capture disabled.
- Deliberate recovery posture for review: when capture is enabled but the initial archiver start throws, its local catch logs the failure and the chain still registers the daily refresh. That later refresh may recover the recorder through OBJ-4. This is not a switch bypass because `cryptoEnabled` was true, but it is included here as the boundary Coltrane should attack.

## Gate C exact diff

Against the rebased Gate B content, Gate C changes only:

- `server/services/crypto-universe-refresh.ts`
- `server/tests/unit/b-universe-refresh-acts-refresh.test.ts`
- `Claude Comms and Packages/Change Lists/B_UNIVERSE_REFRESH_ACTS_CHANGE_LIST.md`
- this handover

## Checks

- Refresh suite: 29/29.
- Recorder + watchdog interaction suites: 18/18 + 30/30.
- Focused total: 77/77 across the three files above.
- TypeScript baseline: current 314 errors, baseline 314 errors; no regression.

## Review ask

At the exact pushed ref named in the Discord dispatch, rule on **Gate C only**:

1. Does the persistent three-handoff page suppress one-off add failures without hiding a repeated symbol failure, and is its clear condition safe?
2. Does the shared occurrence runner actually serialize every production path into this refresh, in-process and across processes, without a bypass?
3. Does the capture switch prevent the daily refresh from starting or changing crypto capture while disabled, including bootstrap ordering?

PROCEED or SEND BACK with exact evidence.

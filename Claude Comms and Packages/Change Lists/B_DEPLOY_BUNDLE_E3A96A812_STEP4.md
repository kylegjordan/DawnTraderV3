# 2026-11-24 staging backlog bundle — aggregate review at `e3a96a812`

**Owner:** ANALYST Codex (`codex-c`)

**Deployed base:** `c21c1502a215b428e2cba2a5214696cb9a1a5c74` (staging record, 2026-11-21T05:08:44Z)

**Exact candidate:** `e3a96a8126f0280a9568bb1823b9210783f0afe0`

**Reason for this aggregate gate:** the 2026-11-23 handover records that the accumulated staging backlog needs its own review rather than relying only on the component reviews. This candidate is the last clean cutoff that carries the paired ANALYST deploy while excluding unfinished `B-UNIVERSE-REFRESH-ACTS` and `B-ALERT-ORPHAN-ROWS` work.

## Candidate boundary

- `19cbbb7ab1b57064b4c9974d6fd936b56fa017ff` (`B-XSTOCK-BAR-AVAILABILITY` R2') is an ancestor.
- `e3a96a8126f0280a9568bb1823b9210783f0afe0` is the reviewed `B-DB-REGIME-ENUM-ALIGN` #1263 head and is on `migration/aws-supabase`.
- `0f06aa6bc3df99a28bff76ed859e86933b756dcc` (`B-ALERT-ORPHAN-ROWS` fold) is **not** an ancestor. It is deliberately held because every shared ref containing it also contains unfinished `B-UNIVERSE-REFRESH-ACTS` runtime work.
- The range changes 36 paths under `server`, `shared`, `scripts`, `drizzle/migrations`, and `package.json`. The exact full-range CI is run `45047451029`, head SHA `e3a96a8126f0280a9568bb1823b9210783f0afe0`: Build, Test Suite, TypeScript Check, and Docker Build all succeeded.

## Behavior-bearing groups and existing component reviews

| batch / owner | behavior in this candidate | component ruling |
|---|---|---|
| `B-XSTOCK-BAR-AVAILABILITY` R2' / CC-C | governed-row migration; Sunday session starts at 20:15 ET; capacity reader, runner and hold align to `2026-11-30T01:00:00Z` | PROCEED, Discord `1574079693408305166`; corrections `19cbbb7ab` |
| `B-DB-REGIME-ENUM-ALIGN` #1263 / CC-C | migration adds the five canonical enum labels; schema and telemetry writer use/normalize canonical regimes; P11 proof command | PROCEED, Discord `1574112442152386662`; exact head `e3a96a812` |
| `B-PRICE-FEED-COVERAGE` OBJ-5 / CC-B | crypto subscription intent survives reconnects across the RTB and active-engine paths | PROCEED, Discord `1574095950950047877`; `d0d64c380`; CI `45041163190` 4/4 |
| `B-AI-BRIEF-OFF` / CC-B | removes the daily AI Summary task import and registration from app boot | PROCEED, Discord `1574070046152462520`; `473a7eb72`; CI `45033693684` 4/4 |

Other range paths do not add trading behavior: the #1250 files are analysis SQL; `alert-followup.mjs` and `closeout.mjs` are operator/governance tools; the token-watch and archival-health changes are comment-only at this cutoff. The token-watch ride-along was reviewed at Discord `1574013031460110468` and commit `9ff39a260`; B-DISK-FILE-TIERING subsequently closed.

## Exact changed-path population (36)

### Migrations and package (6)

- `drizzle/migrations/2026-11-22-b-db-regime-enum-align.sql`
- `drizzle/migrations/2026-11-22-b-db-regime-enum-align-rollback.sql`
- `drizzle/migrations/2026-11-22-b-xstock-bar-availability-window-r2prime.sql`
- `drizzle/migrations/2026-11-22-b-xstock-bar-availability-window-r2prime-rollback.sql`
- `drizzle/migrations/MANIFEST.txt`
- `package.json`

### Production/app and runnable operator code (20)

- `scripts/b-db-regime-enum-align-proof.ts`
- `scripts/crew-tooling/closeout.mjs`
- `scripts/pm/alert-followup.mjs`
- `server/asset_classes/xstock_spot/market-hours.ts`
- `server/core/risk/dynamic-sizing-engine.ts`
- `server/core/rtb/ready_to_buy_service.ts`
- `server/exchanges/kraken/kraken-websocket-adapter.ts`
- `server/index.ts`
- `server/routes/token-watch.ts`
- `server/scripts/b-storage-archival-health.ts`
- `server/scripts/b-xstock-bar-availability-capacity-gate.ts`
- `server/scripts/b-xstock-bar-availability-gate-read.ts`
- `server/services/active-engine-service.ts`
- `server/services/active-execution-engine.ts`
- `server/services/adaptive-learning-repository.ts`
- `server/services/data-archive/xstock-revision-verdict-hold.ts`
- `server/services/rtb-refresh-service.ts`
- `server/services/telemetry-aggregator.ts`
- `server/services/telemetry-repository.ts`
- `shared/schema.ts`

### Tests and analysis (10)

- `scripts/analysis/b1250_exit_book_age.sql`
- `scripts/analysis/b1250_step9_reread.sql`
- `scripts/analysis/b_xstock_bar_availability_r2prime_session_read.sql`
- `server/tests/integration/b-xstock-bar-availability-gate-read.test.ts`
- `server/tests/integration/telemetry_persistence_sql.test.ts`
- `server/tests/integration/telemetry_provenance_patch.test.ts`
- `server/tests/unit/b-db-regime-enum-align-writer.test.ts`
- `server/tests/unit/b-db-regime-enum-align.test.ts`
- `server/tests/unit/b-price-feed-coverage-obj5-reconnect.test.ts`
- `server/tests/unit/b-xstock-bar-availability-observation.test.ts`

## Migration and rollback

Migration order is coherent and independent: R2' first changes one governed module-constant row; #1263 then adds five enum labels before the new app starts. Both forward migrations are idempotent.

Rollback is **not** only an old-SHA deploy. If a post-migration rollback is needed:

1. deploy previous good SHA `c21c1502a215b428e2cba2a5214696cb9a1a5c74` through `dt-deploy`;
2. apply the already-reviewed R2' rollback SQL so the governed row again matches the old gate constant;
3. do not try to remove PostgreSQL enum labels: #1263's rollback intentionally removes only its migration ledger row, and the added labels are harmless to the old SHA.

The rollback sequence itself needs the same stop-and-read discipline; no hand reset or ad-hoc database edit is authorized by this review.

## Warm state and verification anchors

The restart clears RTB/book/cache/AMR in-memory state. R2' does not grade until the 2026-11-30 window, so it has ample warm-up. #1263's isolated P11 proof can run after engine resume. Immediate post-restart trading behavior is not a full PFC verification.

The candidate also carries PFC OBJ-5 and B-AI-BRIEF-OFF. Their owner must anchor verification to this first process if it is the release that lands them. A second immediate deploy would reset the AI 25-hour process-uptime read and add another PFC reconnect, so there is no planned second deploy after this cutoff.

## Preconditions that remain deployment gates, not review assumptions

1. Do not deploy before `2026-11-24T00:00:00Z`.
2. NEW confirms the B-ENTRY-GATE read has been taken and accepts this restart as the PFC/AI deployment anchor.
3. INFRA provides the required B-AI go-ahead and confirms no installation conflict.
4. Coltrane rules on this aggregate bundle.
5. Immediately before deploy, re-census the candidate register and name every open/stale row with `--in-window`; notify all owners.

The current candidate-register census has nine rows: `B-AI-BRIEF-OFF`, `B-ENTRY-GATE`, `B-PRICE-FEED-COVERAGE`, `B-PRICE-SIDE-BY-JOB`, `B-RTB-PROMOTION-RETRY-STORM`, `B-TOKEN-WATCH-BIRTH-CAP`, `B-TOKEN-WATCH-FOLLOWUP-MEMORY`, `B-XSTOCK-BAR-AVAILABILITY`, and `B-XSTOCK-BID-TRIGGER-RELAND`.

## Reviewer reruns

```bash
git diff --name-only c21c1502a215b428e2cba2a5214696cb9a1a5c74..e3a96a8126f0280a9568bb1823b9210783f0afe0 -- server shared scripts drizzle/migrations package.json
git log --first-parent --reverse --format='%H %s' c21c1502a215b428e2cba2a5214696cb9a1a5c74..e3a96a8126f0280a9568bb1823b9210783f0afe0
git merge-base --is-ancestor 19cbbb7ab1b57064b4c9974d6fd936b56fa017ff e3a96a8126f0280a9568bb1823b9210783f0afe0
git merge-base --is-ancestor 0f06aa6bc3df99a28bff76ed859e86933b756dcc e3a96a8126f0280a9568bb1823b9210783f0afe0
gh run view 45047451029 --json headSha,status,conclusion,jobs
git show e3a96a8126f0280a9568bb1823b9210783f0afe0:1-system-manual/DEPLOY_WINDOWS.jsonl | /usr/local/bin/dt-obs-windows census --now <deploy-time-UTC>
```

## Fresh-reader record

`REVIEWER: claim-only · exact deploy bundle c21c1502a..e3a96a812 is safe to release as one reviewed cutoff · HOLD until aggregate Coltrane ruling plus NEW/INFRA preconditions; no hidden unreviewed trading behavior found in the 36-path population, rollback must include R2' row restoration, and later refs are contaminated by unfinished B-UNIVERSE runtime work · re-derived y`

## Ruling requested

**PROCEED or SEND BACK** on deploying exact SHA `e3a96a8126f0280a9568bb1823b9210783f0afe0` once the time and owner gates above are satisfied. Specifically attack the aggregate compatibility of the four behavior-bearing batches, migration order, rollback asymmetry, and the claim that this is the last clean cutoff before unfinished B-UNIVERSE runtime work.

## Coltrane ruling

**PROCEED** at exact review ref `3087bb7c98727a82a48e89d32a2b268a90cb635e` (`2026-11-23T22:47:56Z`), authorizing deployment of exactly `e3a96a8126f0280a9568bb1823b9210783f0afe0` once the separate time, NEW, INFRA and immediate pre-deploy window-census gates pass. No later SHA is covered.

Independent checks reproduced 5/5 canonical regime labels across configuration, schema and migration, including a mutation that failed when one migration label was deleted. The R2' migration precedes #1263 and they touch independent state; PFC reconnect state and AI Summary removal do not conflict. Coltrane also re-derived the rollback asymmetry and confirmed the cutoff has zero B-UNIVERSE and zero B-ALERT-ORPHAN runtime paths, while later history contains both.

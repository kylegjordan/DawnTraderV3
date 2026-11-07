# B-CRYPTO-FEED-WATCHDOG (#1232) — STEP 9 CHANGE LIST (objective 4's display half) — for Langston's Step 4

**Graded ref:** branch `review/b-crypto-feed-watchdog-step9` at `0c72fddfee448bfbbacf5d2ed84bda6bdbc5d9e3` (two commits on `9e3297460`). **Deliberately NOT on `migration/aws-supabase`:** the 2026-11-07 joint deploy takes the branch head, and a runtime commit without a PROCEED would stop it. It lands on the branch AFTER the joint deploy, gets CI 4/4 per job there, then deploys. CI does not run on `review/**` (`ci.yml:14-18`), so the CI leg is owed at landing.
**Ruling it answers:** Langston 2026-11-06 ~17:00Z — objective 4 back to Step 9 with five conditions; objective 6's STATUS line carried; the `feed-health-aggregate.ts` header corrected in the same push.

## The defect (re-derived by Langston)
`getCryptoSpotStats().connected` = every shard `readyState === OPEN` (`crypto-spot-archiver.ts:90`); futures `:83`. The Passive Archive status badges DISCONNECTED only off `!connected`, and NO_TICKER_DATA only on a process-wide zero (`drift-dashboard-aggregator.ts:1047`, `:1052`). **The 14-day half-open shard0 would have badged OK.**

## The change (7 files, +324 / −12)
| file | what |
|---|---|
| `server/services/passive-archive/recorder-connection.ts` | NEW `RecorderConnection.dataLiveness(nowMs)` → `{ key, socketOpen, dataLive: 'live'\|'silent'\|'unknown'\|'starting' }`, precedence documented on the method: socket not OPEN ⇒ `silent` (a fact, no threshold needed; DISCONNECTED outranks it on the panel) · `resolveConfig()` null ⇒ `unknown` (never live, never silent) · OPEN, no data frame yet, within `silenceMs` of the open ⇒ `starting` (bounded, so a socket that opens dark cannot read starting forever) · else `isDataLive` ? `live` : `silent`. Sync, in memory; no DB read in the request path. |
| `crypto-spot-archiver.ts`, `kraken-futures-archiver.ts` | stats gain `connections[]` (one per shard / per futures leg) and `nonLiveConnections`. **`connected` is unchanged** (condition 1). |
| `drift-dashboard-aggregator.ts` | status order: DISCONNECTED (or STARTING at 0 symbols) → **DATA_SILENT** (any connection silent; `dataSilentConnections` says how many) → **LIVENESS_UNKNOWN** → **STARTING** (open, before first data) → NO_OHLC_DATA → NO_TICKER_DATA → COUNT_UNKNOWN → OK. A universe without `connections` (xstock_spot — not a RecorderConnection) is NOT graded by the new arms: `connectionLiveness: null`, never "silent". equity-perp IS graded (it is a RecorderConnection). |
| `client/src/pages/analytics.tsx` | badges `DATA SILENT · n of m` and `LIVENESS UNKNOWN`; a per-connection line under the badge (`shard0: socket open · data silent`); legend entries. |
| `server/services/market-data/feed-health-aggregate.ts` | comment only: only the ALARM takes the worse of the two; `health-monitor.ts:529` / `system-health-monitor.ts:301` still read freshest-only; the recorder live-share STATUS line is a carried follow-up, not built. |
| `server/tests/unit/b-crypto-feed-watchdog-panel.test.ts` (new) | real `RecorderConnection`s on a fake socket through the real `getCryptoSpotStats` and the real panel status: shard0 OPEN-but-silent ⇒ DATA_SILENT (condition 5, objective 4's own Verify) · both live ⇒ OK · threshold unreadable ⇒ LIVENESS_UNKNOWN · STARTING before first data, DATA_SILENT past the threshold · socket down ⇒ DISCONNECTED · xstock_spot ungraded, a futures leg graded. |

## Verification at the ref (CC-B re-ran, 2026-11-06 ~18:25Z)
- `node scripts/check-tsc-baseline.mjs`: 328 vs baseline 328, no regression.
- vitest: the new panel file 6/6, `b-crypto-feed-watchdog.test.ts` 29/29, `b-ohlc-frame-guard-archive-counts.test.ts` 12/12.
- **Mutation:** panel ignoring the new field ⇒ 6 of 6 panel tests red; only the DATA_SILENT arm removed ⇒ tests 1, 4, 6 red (status read OK). Restored ⇒ green.

## For the reviewer to rule on
1. At process start, a recorder universe reads STARTING (not NO_OHLC/NO_TICKER) for up to the silence threshold (120 s) after its socket opens — follows from condition 4's precedence.
2. Socket down reads `silent`, not `unknown`, even with an unreadable threshold (a closed socket delivers nothing); DISCONNECTED outranks it on the panel either way.
3. ~~`starting` covers process start only; after a reconnect `lastDataAtMs` carries over, so a reconnected socket reads `live` for up to the threshold before `silent`.~~ ⛔ **CORRECTED r2 (Langston): half-true.** `starting` is process start only, and `lastDataAtMs` carries over a reconnect — so on the CLOSE-driven and subscribe-timeout paths a reconnected socket reads `live` while the carried value is inside the threshold. On the SILENCE-driven path (`forceReconnect` because data stopped) the carried value is already past it, so the new socket reads `silent` until its first data frame — correctly. The class's "notions of live" block is now THREE, naming `decideSilence`'s fresh-socket window beside it.
4. Reading the panel calls `resolveConfig()`, which can raise the existing one-time `passive-archive-config-missing` alert, as the witness-vouch path already can.
5. The 60 s health line is unchanged (it already prints `connected=` beside `data_age_ms`).

## Step 7 plan (after the deploy) — never by opening the Drift Dashboard (`#1037`)
The unit test is the panel evidence; on staging, the stats function's new fields read through a lightweight route or a one-off node read, every connection `live` on a healthy feed.

## r2 — Langston's Step-4 fold-ins (CHANGES-NEEDED, narrow), at `5742ffe5db075ce51771e20fdab4eb2a383ea139` on `review/b-crypto-feed-watchdog-step9`
1. Behaviour point 3 corrected (above), and the code's "notions of live" block in `recorder-connection.ts` now names the third (`decideSilence` grants a fresh socket a whole window; `dataLiveness` does not).
2. `nonLiveConnections` → **`silentOrUnknownConnections`**: excludes `starting` (a healthy restart no longer reports non-zero for ~120 s) and states at the field that it is not an alarm numerator on its own. Its only reader is still the test.
3. The panel grades a universe only when `stats.connections` is an ARRAY (`Array.isArray`), not on a presence test.
Re-run at the ref: tsc baseline 328/328; tests 6/6 + 29/29 + 12/12. **Carried on `#1232`, beside the recorder-live-share STATUS line:** xStock spot stays ungraded on this panel by choice — it has its own data clock (`state.lastDataMsgAt`, `#594`) — bug-taxonomy outcome (2), a scope decision, not this batch's.
**Land conditions (Langston):** the files that land on `migration/aws-supabase` must be byte-identical to this ref, then fresh CI 4/4 per job on the branch before the deploy.
## LANDED, CI, DEPLOYED (2026-11-07)
- **Landed** on `migration/aws-supabase` after the joint deploy as `bd3b5ff7d` / `4b4bd0adc` / `dc8a5cf1c` (cherry-picks of `40d208dfc` / `0c72fddfe` / `5742ffe5d`). **Byte-identity:** `git diff --stat 5742ffe5d <landed> -- <the 7 files>` is EMPTY at `dc8a5cf1c` and at `c0fe598a0`; the head had not touched those files since the base `9e3297460` (also an empty diff).
- **CI:** run `42377198325` at `c0fe598a0` (a descendant containing the fix): Test Suite, TypeScript Check (baseline gate), Build, Docker Build — all success. (The run at `dc8a5cf1c` itself was cancelled by the next push.)
- **Runtime diff staging → deploy sha:** `e0e68dfdb..c0fe598a0` over server/shared/client/scripts/drizzle/package.json = exactly these 7 files, these 3 commits — nothing else rode along.
- **Deployed:** `c0fe598a0061a910e366a5d0bf2863553b2ad2fa`, `dt-deploy --by cc-b`, 2026-11-07T13:35:46Z (restart 679; migrate ran, nothing pending; rollback `e0e68dfdb`).
- **Step 7, first pass:** recorders reconnected and subscribed at 13:35:46Z; the first post-restart health lines (13:36:39Z) read shard0 `connected=true symbols=196 data_age_ms=92 rows_persisted_60s=1863`, shard1 `symbols=201 data_age_ms=108 rows_persisted_60s=2028`; 0 `passive-archive-config-missing` lines. **The panel itself was NOT opened and its endpoint NOT called** (`/api/analytics/passive-archive-status` runs the archive count queries that `#1037` am.1/2 tie to pool exhaustion from this panel). The panel-status evidence is the CI-run panel test (real connections → real `getCryptoSpotStats` → real `computePassiveArchiveStatus`: OPEN-but-silent ⇒ DATA_SILENT). Whether one API call is acceptable on a quiet weekend is put to Langston, not assumed.

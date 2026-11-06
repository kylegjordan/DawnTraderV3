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
3. `starting` covers process start only; after a reconnect `lastDataAtMs` carries over, so a reconnected socket reads `live` for up to the threshold before `silent` — the same connection-scoped notion `isDataLive` already uses.
4. Reading the panel calls `resolveConfig()`, which can raise the existing one-time `passive-archive-config-missing` alert, as the witness-vouch path already can.
5. The 60 s health line is unchanged (it already prints `connected=` beside `data_age_ms`).

## Step 7 plan (after the deploy) — never by opening the Drift Dashboard (`#1037`)
The unit test is the panel evidence; on staging, the stats function's new fields read through a lightweight route or a one-off node read, every connection `live` on a healthy feed.

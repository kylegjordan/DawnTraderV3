# ITEM 4.6-A — Disk-hygiene execution record (operational; 2026-06-10)

> Readiness-checklist item 4.6 half A (Kyle-approved 2026-06-10 ~00:25Z; Langston GO with sequencing corrections in the step-6 review). Executed 10:36Z, deliberately AFTER the throughput-study windows so the logging change could not contaminate the baseline/concurrent comparison. Root-cause credit: Langston's 2026-06-09 investigation.

## What was executed (Langston's corrected order — systemd-first, or the tool respawns in 5s)
| # | Action | Result |
|---|---|---|
| 1 | `systemctl disable --now tec-pg-capture` | Service disabled + inactive; both stale capture processes (PIDs 61657/61667, running since May 17, writing 2 files/min) terminated — **his correction caught that a plain kill would have been undone by `Restart=on-failure` in 5 seconds** |
| 2 | `mv /usr/local/bin/tec-pg-capture → tec-pg-capture.disabled` | Reversible disable of the B-NEW-40-era TEC investigation tool (investigation closed; #141 resolved) |
| 3 | `rm -rf /var/log/dawntrader/tec_diag` | **66,032 stale diagnostic files / 476MB removed** (after the service stop, per his ordering note — it was still writing) |
| 4 | `truncate -s 0 /var/log/dawntrader/out.log` | **43.46GB → 0**; pm2's append-mode handle persisted (Langston-confirmed safe); fresh writes landing immediately |

## Verification
- Disk: **80% → 24%** (57G → 18G used; 55G free).
- App health through the operation: HTTP 200, pm2 online, VTS beats **uninterrupted at exact 60s** across the truncation (10:36:41 → 10:37:41 in the fresh log).
- No restart was needed; zero downtime.

## Remaining 4.6 work (owned)
- ✅ **4.6-A code half SHIPPED same day:** the per-pair debug line (`market-context-engine.ts`, ~98 lines/min ≈ the bulk of the 43GB) is behind **default-OFF `MCE_PER_PAIR_LOG`** (env, read once at module load; `=1` reproduces the historical line byte-identically). Langston Step-4 **APPROVE** (no revisions); bench tsc + vitest green (11 pre-existing-only failures, verified same set); CI run `27270926406` all-4-green on `2bb87d6e3`; deployed + **both-halves log verify PASS** (zero per-pair lines post-restart [last old-code line 10:49:02, new engine up 10:49:32, 0 after]; boot/lifecycle MCE lines intact; VTS beats exact through the restart). Once OFF, `pair_scan_archive` row count is the **sole compute-once witness** (stated in the steps-4-6 report per Langston).
- **4.6-B structural scan fix:** scoped from `ITEM_4_THROUGHPUT_STUDY_RESULTS.md`; MUST carry `perf_hooks.monitorEventLoopDelay` histograms for before/after; lands before items 4.5/4.7.

## Governance
Checklist item 4.6 status updated · BATCH_CATALOG row · this record · MEMORY 3-way. Rollback: re-enable by renaming the script back + `systemctl enable --now tec-pg-capture` (unit file intact).

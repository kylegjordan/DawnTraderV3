# B-WAKE-HEARTBEAT-CONTROL-DATE (#1162, row 1q) — Step 7 verification record (2026-10-16)

**Purpose:** commit the laptop-side evidence, which only CC-A can read, so Langston's Step 8 can re-derive the outcome. Everything on Helsinki he reads himself.

## Installed (Step 6, 18:58Z)
Three files were written from blob `10eacd39df34345d923fe31ac0b6b928b151a483`. sha256 after stripping CR, first 16 characters, blob vs live:
- `SKILL.md` `de59e2a5e1f91621`, matching;
- `control_state.py` `08c0d45203e327f9`, matching;
- `cc-wake-filter.py` `7c8ed3022fa359a0`, matching.

The previous live copies equalled the pre-batch ref `4be562e14` and are backed up. The installed filter keeps `LEASE_V1`, parses, and passes the 35-case suite run against the live path.

## The three live runs (Helsinki inbox, sender `Heartbeat` — Langston reads these himself)
| run | post (Helsinki clock, inbox `ts`) | control field | notify |
|---|---|---|---|
| "Run now" install | 19:00:05Z | `CHECK FAILED - control record new; CC-A held (record reset); CC-B DEAD; CC-C held (record reset); CC-INFRA DEAD.` | True — the expected one-time page, plus the DEAD watchers |
| scheduled | 19:15:46Z | `CC-A re-issued; CC-B DEAD; CC-C re-issued; CC-INFRA DEAD.` | True, from the DEAD watchers only. **No control page.** |
| scheduled | 20:15:10Z | `CC-A answered; CC-B DEAD; CC-C answered; CC-INFRA DEAD.` | True, from the DEAD watchers only |

**The case `#1162` was about, fixed:**
1. CC-A and CC-C were re-armed after the 07:13Z control, starting from the log end (CC-A's stale-resume notice is in task output `b5l0ec9p0`), so they never saw it.
2. Before this batch, that gave NOT answered and an hourly page all day (08:16, 10:16, 11:15, 12:16 and 15:15Z).
3. Now: one run held on the new record, then a re-issue, then answered — and no control page at any point after the expected install page.

## Helsinki `/var/log/cc-wake.log` (inode 1255, 90,515 bytes at 20:16Z) — the last six control lines, by byte offset
```
90331 CC-A 20261016    90361 CC-B 20261016    90391 CC-C 20261016    90421 CC-INFRA 20261016   (the 07:13Z daily issue)
90455 CC-A 20261016    90485 CC-C 20261016                                                      (the 19:14Z re-issues)
```
Exactly one re-issue each, for the two aliases that were armed and alive and had read past their line without answering. No re-issue for the DEAD aliases.

## Laptop state at 20:16Z (CC-A-only evidence)
| alias | `.control` (laptop clock) | lease `taken_at` (laptop clock) | `pos['/var/log/cc-wake.log']` |
|---|---|---|---|
| CC-A | `20261016 2026-10-16T19:14:38Z` | 19:17:00Z (re-arm after a wake) | `[1255, 90515]` |
| CC-B | `20261013 2026-10-13T07:14:29Z` | 10:49:42Z | `[1255, 90455]` — DEAD |
| CC-C | `20261016 2026-10-16T19:14:39Z` | 20:15:22Z | `[1255, 90515]` |
| CC-INFRA | `20261008 2026-10-08T07:14:52Z` | 2026-10-08 | `[1255, 90455]` — DEAD |

**The answers landed 3-4 s after the re-issue was written, by the LAPTOP clock** (both endpoints are laptop-clock: the re-issue `at` 19:14:35Z is stamped by `control_state.py` on the laptop, and the answers at 19:14:38Z and 19:14:39Z by the filter on the laptop). **By the HELSINKI clock** the wake log's mtime after the CC-C re-issue append is 19:14:41.570Z (Langston, Step 8). Read across clocks, the answer appears to precede its line. That is clock skew and/or SSH latency between the two machines, which neither side can discriminate (Langston's Step-8 record item; clocks named per §13 disposition 1).

`heartbeat-control.json` at 20:16Z:
- CC-A and CC-C each hold one re-issue (`at 19:14:35Z`, offsets 90455 and 90485) and token `20261016`;
- `log_ino 1255`, `issuer_fail 0`;
- no `.lock` file is left behind, so the lock was released.

## Open, not this batch
CC-B and CC-INFRA watchers are DEAD (sessions closed), and their sessions own the re-arm. The install post asked all four sessions to re-arm so they load the new filter.

## Step 8 — CONFIRMED by Langston (20:20Z), re-derived on Helsinki
He ran the committed regex arms against the posted bytes. Only the 19:00 post matches the control arm; the watchers arm matches all three, on the `watchers:` field. A positive control on the pre-batch `NOT answered` shape matches. The wake-log tail was confirmed byte for byte. The laptop table above is his only reported-fact leg. **The live non-regression of a genuine `NOT answered` page rests on the suite plus his positive control, not on live data**, while CC-B and CC-INFRA stay DEAD.

## Post-close live evidence — the original `#1162` form (2026-10-16 22:14:49Z, Helsinki clock)
The run at 22:14:49Z (laptop local date already 2026-10-17, UTC+2; issuer UTC date still 20261016) posted `control: CC-A answered; CC-B DEAD; CC-C answered; CC-INFRA DEAD.` This is the window where the old prompt read the laptop's "today" (20261017) against yesterday-UTC's token and paged NOT answered (the 2026-10-06 23:15Z case). The script issued nothing, because `N == D`, and judged by exact token: answered. This is OBJ-1's discriminating fixture, now observed live.

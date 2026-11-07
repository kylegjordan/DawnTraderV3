# B-TOKEN-WATCH-FOLLOWUP-MEMORY — CHANGE LIST (Step 4, by piece)

**Batch:** B-TOKEN-WATCH-FOLLOWUP-MEMORY (§0 Infra order 5) · **change-class:** non_architecture · **Step 2:** `Scope Files/B_TOKEN_WATCH_FOLLOWUP_MEMORY_PRE_AUDIT.md` (r1g + §5, the Step-3 entry audit, RULED 2026-11-07) · **Owner:** Infra Claude · **Declared open:** `GOVERNANCE_EXCEPTIONS.md`, first code-bearing push `bf84dba87`.

## P1 — the measurement

| file | kind | what it does |
|---|---|---|
| `token-watch/tools/capture_followup_bodies.py` | NEW | one real DexScreener body per distinct mint of the 48 buckets, into a SCRATCH tree only (refuses the production store before importing anything that writes); fresh ledger; checkpoint keyed to mints attempted; disk floor every 1,000; missing bucket refused by name; `--resume`. |
| `token-watch/tests/test_capture_followup_bodies.py` | NEW | 19 checks, fake egress. Mutations caught: copied bodies counted (3), no missing-bucket refusal (4), no disk floor (2), no production refusal (1). |
| `token-watch/tools/make_followup_scratch.sh` | NEW | A6's minimal faithful copy into `/var/lib/token-watch-scratch` (tokenwatch 0700); refuses unless the follow-up timer is disabled and inactive, if the tree exists, a named file is missing, or free space would fall under 10 GiB. |
| `token-watch/tools/measure_followup_memory.py` | NEW | the replay harness: `index`, `prepare`, `run`, `lookup-baseline` (its header is the spec). |
| `token-watch/tests/test_measure_followup_memory.py` | NEW | 42 checks; each `run` in its own process. |
| `token-watch/tools/run_followup_arm.sh` | NEW | runs one arm in its own systemd unit and records the unit's own Result (a KILL is `oom-kill` there, never a missing output file). |

### Step 4 round 2 — Langston's r1 on the harness (Discord `1568558720689111052`, at `03aa62c77`)
He accepted the C-5 correction (the gate reads the wall clock; the freeze is the fix; C1 is its control).
- **BLOCKER-1 MemoryMax never verified →** `run` reads `memory.max` from its own cgroup and VOIDS (exit 8) unless it is exactly 536,870,912; `memory.events` (`max`, `oom`, `oom_kill`) recorded. Test M1: `max` → exit 8, nothing ran; `536870912` → exit 0 with both recorded.
- **BLOCKER-2 trace missed the identity map →** the wrap target is `summary._identity_map` (summary binds `from store import identity_map as _identity_map`); `wrap` now RAISES on a missing attribute. Test T1: snapshots before and after `summary._identity_map` exist.
- **BLOCKER-3 x4 not 4× →** the x4 arm builds a 4× TEXT before parsing: the body plus `_pad` = three copies of the body itself (inert: `token_state` reads top-level `pairs` only), so bytes and objects scale. Every arm re-parses from text. Test X1: served bytes 3.9-4.1× the live arm's; `observed` and `errors` unchanged.
- **BLOCKER-4 live/x4 had no control →** a served-share floor on the LOOP's own lookups (`--min-served-share`, default 0.95), VOID exit 9 below it; `index` refuses an empty index and any duplicate mint. The tautology is gone: L1 asserts `served_bodies == 134` and `loop_served == 134`. Test F1 (0.99 floor on a 0.944 fixture) → exit 9.
- **5 Helius branch skew →** getAccountInfo now answers with one of the 40 REAL curve replies in `tests/fixtures/pumpfun_curves.json` (all owned by the pump.fun program; chosen by a hash of the pool address), so the one-call curve path runs; anything else → `[]`. L1: synthetic calls ≤ one per alive token.
- **6 freeze could skip silently →** `CLOCK_MODULES` is the one list and is enforced: any of the seven not frozen → VOID exit 10; `frozen_modules` recorded. `receiver` stated as unfrozen and why (webhook-path clock reads only).
- **7 egress control ambiguity →** a LITERAL-IP probe must fail with EPERM/EACCES, and the named host must fail too; `--egress-probe` lets a test point it at a live socket. Test E1: a listening socket → exit 6 "SUCCEEDED"; ECONNREFUSED on a literal IP → exit 6 "not EPERM".
- **8 prepare had no floor →** the 10 GiB floor before and after the copy, `nice 19` + `ionice -c3`, and `provenance/follow-up` NOT copied unless `--with-bodies`. Test P2: free space faked to 1 B → refused, nothing copied.
- **9 the tree a run used →** `prepare` writes `PREPARE.json`; `run` carries it into its result; the bytes p99/max of the bodies THIS run served are reported.
- **10 x4 untested →** X1.
- **11 minor →** the journal cut parses `ts`; all_shed's spend is `cap + 1`; `index` refuses a production `--out`; the comment on the journal offset now says WHY offset 0 is faithful (no fold since 09-30).
- **(c) now = :00, stated:** the low-work end of the hour (most requeued), the only reproducible choice; a `:59` re-run brackets it if the answer lands near the ceiling.
- **(d) baseline →** `lookup-baseline`: fetches every distinct mint of the 48 buckets from the index exactly as `run` would, and nothing else; its `ru_maxrss` sits beside the arms with the 2 MiB cache bound. Test B1: 144 lookups, 134 found.
- **Questions:** (i) the paired instrument (last observation ≤ 09-27 per mint; the no-pairs share for 09-26 / 09-27 / the capture, drift direction stated) is a separate read-only tool, `tools/pair_nopairs_share.py`, to come with the capture's results — it reads the live store's observations read-only, so it is its own gate. (ii) duplicates are now REFUSED, not first-wins: the capture calls each mint once, so a duplicate is an anomaly. (iii) a kill is recorded by `run_followup_arm.sh` from the unit's own `Result` (`oom-kill`), the `systemd-run --wait` summary and `systemctl show` (`MemoryPeak`, `ExecMainStatus`).
- **Mutations, each caught by exit code:** memory control off (2 fail), literal-IP errno not required (1), trace on the dead name `store.identity_map` (1), served floor off (1). 42 checks pass unmutated.

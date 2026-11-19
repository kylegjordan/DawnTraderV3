# B-TOKEN-ECONOMY — P1/P4 canary log (PM session 994e6488)

Record: actor PM Claude; crew mode CLAUDE gen 3; the settings are applied LOCALLY in `C:\DawnTraderV3-pm\.claude\settings.local.json` and are UNCOMMITTED until the verdict (Langston Step-2 condition 4). Applied 2026-11-19 ~15:05Z:
- `autoCompactWindow: 250000`
- `idleCompaction: false`
- `env.CLAUDE_CODE_SUBAGENT_MODEL: "sonnet"`
- `.claude/agents/Explore.md` (`model: haiku`, tools Glob/Grep/Read): new and untracked

## Observation 1 — a running session does not pick these up (2026-11-19 ~15:10Z)
This answers A1's open question; the docs were silent on it.

| check | instrument | expected if live | observed |
|---|---|---|---|
| compaction threshold | `get_usage` (self) `autoCompactsAtPercent` | ~25 | **97** (unchanged; context 590,266 of 1,000,000) |
| default helper model | subagent transcript `agent-aa4645442c02a0bb1.jsonl`, assistant `model` | claude-sonnet-5-5 | **claude-opus-5-5** (3 lines) |
| explicit `model: haiku` on the call (control 2) | `agent-a225354dd0def4686.jsonl` | claude-haiku-5-5 | **claude-haiku-5-5** (2 lines; 1 opus line). The per-call parameter works live |
| `Explore` override | `agent-a8871b32c6bfcedff.jsonl` | claude-haiku-5-5 | **claude-opus-5-5** (5 lines). The project agent is not loaded live |

**Conclusion:** settings `env`, `autoCompactWindow` and project agent definitions are read at session start. The canary therefore needs a restart of the PM session. That restart is also the "resume" path the P1 checks require.

## To observe after the restart
1. `autoCompactsAtPercent` is about 25 and the context is compacted (it was 590k).
2. The start-up chunks load: CONDUCT 4/4, the session reminder, own memory.
3. An `instructions-loaded.jsonl` line appears with a compact or resume event.
4. MEMORY_PM's CURRENT POSITION is restated.
5. The alert line appears on the next prompt.
6. Zero duplicate uuids.
7. The four served-model controls: default gives sonnet; explicit haiku gives haiku; explicit opus gives opus-5-5; Explore gives haiku.
8. Precedence: the project-local value wins. User settings have no `autoCompactWindow`; this is re-read and recorded.

## Observation 2 — after the restart (archive and unarchive by Kyle; read 2026-11-19 ~15:25Z)
Same session id (994e6488); one compaction at the restart (`instructions-loaded.jsonl`, `SessionStart` source `compact`, 15:23:01Z).

| # | check | instrument | observed | verdict |
|---|---|---|---|---|
| 1 | compaction threshold | `get_usage` (self) | `contextWindow` **250,000** (was 1,000,000); `autoCompactsAtPercent` 87 of that, so compaction starts near 217k; context 158,358 after the compact | **PASS.** The app applies the setting as a smaller window, not as a lower percent of 1M. The effect is the one wanted: no turn can carry more than 250k |
| 2 | start-up chunks | hook output in the resumed transcript | CONDUCT 4/4, the session reminder, rules freshness. No own-memory chunk: the PM clone is unmapped, as A-audit recorded | **PASS** |
| 3 | loaded-log event | `~/.claude/instructions-loaded.jsonl` | `SessionStart` source `compact` at 15:23:01Z, then two native `InstructionsLoaded` lines | **PASS** |
| 4 | CURRENT POSITION restated | this session | Step 3, P1/P4 canary, settings uncommitted until verdict | **PASS** |
| 5 | alert line | `UserPromptSubmit` hook | full list (41 due), unmapped clone | **PASS** |
| 6 | duplicate uuids | parse of the whole transcript, 111,620,980 B, 18,175 entries with a uuid | **0** duplicates | **PASS** |
| 7a | default helper (no model) | `agent-a2eadeb4b1a79f5ca.jsonl`, assistant `model` | **claude-opus-5-5** | **FAIL.** `env.CLAUDE_CODE_SUBAGENT_MODEL` did not reach the session: the Bash tool's environment does not hold it either. The env leg is withdrawn and removed from the settings |
| 7b | explicit `model: haiku` | `agent-aedf2933040b36e8c.jsonl` | claude-haiku-5-5 | PASS (control) |
| 7c | explicit `model: opus` | `agent-a0fffd1c96b9e544b.jsonl` | claude-opus-5-5 | PASS (control) |
| 7d | `Explore` override | `agent-a44a553aa8e9e7acf.jsonl` | **claude-haiku-5-5** | **PASS.** The project agent replaced the built-in |
| 8 | precedence | `~/.claude/settings.json` | no `autoCompactWindow`, no subagent env there; nothing to conflict with | NOT TESTED (no competing value exists); recorded, not claimed |

`idleCompaction: false` has no observable at this point; it is recorded as set, not as proved.

**Verdict:** the compaction cap (P1) and the `Explore` override (P4) pass and are committed. The default-helper leg fails by the `env` route. **Replacement, same objective (OBJ-4), proven mechanism:** a project agent named `general-purpose` with `model: sonnet`, the route 7d showed works. It is applied locally, uncommitted, and needs one more restart to observe (check: a no-model `general-purpose` call serves `claude-sonnet-5-5`). This changes the mechanism Langston approved at Step 2, so it goes to him at Step 4 with this log.

## Observation 3 — P6 alert-delta, shadow controls (2026-11-19 ~15:36Z)
Built: `scripts/crew-tooling/alert-delta.mjs` (shadow only). `inject-due-alerts.mjs` calls it after every read and logs what it WOULD inject to `~/.claude/alert-delta-shadow.jsonl`; **the injected text is unchanged — every session still gets the full list.** A `SessionStart` (`startup|resume|compact`) hook runs `--reset`, so the first prompt after a start or compaction is always the full list (Step-2 condition 3: `SessionStart` source `compact` was observed at 15:23:01Z, Observation 2 #3). Codex sessions are untouched and keep the full manual read.

Instrument: the real hook against the live staging queue (41 due, 3,466 ids), session id `canary-p6b`, state and log in a scratch folder (`ALERT_DELTA_DIR`, `ALERT_DELTA_LOG`).

| # | control | shadow log row | verdict |
|---|---|---|---|
| 1 | reset, then first prompt | `reset:compact`, FULL LIST | PASS |
| 2 | same queue | "41 due, UNCHANGED (41 unchanged)" — never silence | PASS |
| 3 | positive control: one id removed from the saved baseline | 1 new, 0 changed, 40 unchanged; the NEW line names it | PASS |
| 4 | next prompt | UNCHANGED again (the new alert is shown once) | PASS |
| 5 | forced failure (unreachable host) | `check_failed`, "ALERT CHECK COULD NOT RUN … not 'no alerts'; baseline kept"; state file hash unchanged | PASS |
| 6 | next prompt after the failure | UNCHANGED (baseline survived the failure) | PASS |
| 7 | `--reset` again | FULL LIST | PASS |
| 8 | `--verify` (recomputes every delta from the previous OK row) | exactly ONE mismatch: row 3, the row whose baseline was edited by hand | PASS as a positive control for the verifier: it catches a baseline that does not match the logged history |

`--self-test` 10/10; `scripts/analysis/test-alert-split.mjs` 42 passed, 0 failed.
A first run reported "18 changed" at row 3: the test script read the state file in the Windows default encoding and corrupted titles containing a dash. All 18 changes were in `title`; with UTF-8 the result is 0 changed. A harness fault, not a code fault.

**Switch gate (pre-audit P6):** at least 50 real prompts or 3 days in the shadow log, `--verify` reports PASS, then Langston reviews; the switch to injecting the delta is a separate commit. The `--reset` registration loads at the next session start (settings load at start).

## Observation 4 — P7 warning dedupe (2026-11-19 ~16:00Z)
Built: `scripts/crew-tooling/warn-dedupe.mjs`. The three warn-only guards (`guard-measurement-shape`, `guard-stale-fetch`, and `guard-result-shape`'s rare legs) now show each warning KIND once per session; a second `SessionStart` (`startup|resume|compact`) hook runs `warn-dedupe.mjs --reset`, so the first warning after a start or compaction shows again. **Sinks are still written on every event** (the hook self-test reads them). Each guard loads the helper fail-open: if it cannot load, every warning shows. No blocking guard is touched. `guard-result-shape`'s cap-bound leg keeps its own per-command dedupe file. State: one file per session under `~/.claude/cc-wake-state/warn-dedupe/`, files of sessions idle for 7 days swept at reset.

Instrument: the real hooks run as child processes with synthetic stdin; state in a scratch folder (`WARN_DEDUPE_DIR`).

| # | control | observed | verdict |
|---|---|---|---|
| 1 | first `truncation-is-not-population` | shown | PASS |
| 2 | same kind, different command | nothing shown | PASS |
| 3 | new kind plus the old kind | only `count-from-search` shown | PASS |
| 4 | reset (as at compaction), then the first kind | shown again | PASS |
| 5 | `guard-stale-fetch`, twice, reset, again | shown, nothing, shown | PASS |
| 6 | `guard-result-shape` `html-not-json`, twice, reset, again | shown, nothing, shown | PASS |
| 7 | test-suite mode (`GUARD_SYNTHETIC=1`, no `WARN_DEDUPE_DIR`) | never dedupes, writes no state | PASS |
| 8 | sinks | measurement-shape sink rows still written for every event | PASS |

`warn-dedupe.mjs --self-test` 10/10 (includes: no session id, an unsafe id and a corrupt state file all SHOW). `test-guard-measurement-shape` 75 PASS 0 FAIL; `test-guard-result-shape` and `test-hook-selftest`: results in the commit message.

**For Langston at Step 4:** `guard-result-shape`'s 2026-09-02 ruling gave the rare legs the full warning every time. P7 (approved at Step 2) dedupes them per session per leg. The saving there is small (rare legs are ~0.04% of its fires); the reason to keep it is one consistent rule across the three warn-only hooks. If he prefers the rare legs to keep firing every time, it is a two-line revert in that file.

## Observation 5 — P9 read after P5 and P8 (2026-11-19 ~20:40Z)

Instrument: `token-baseline.py` (the P0 instrument), window 2026-11-19 15:25Z to 20:35Z.

| what | object and population | reading | status against the leg-B criterion (median ≤ 152,000 B per start) |
|---|---|---|---|
| `CLAUDE.md` size | the blob at `198e6ddcb`, LF bytes | 77,480 B (was 122,263 at `8c1cebbc4`), −44,783 B | **measured**: under the 78,000 B cap |
| always-loaded bytes per start | `instructions-loaded.jsonl`, this window | UNMAPPED (PM) median 148,042 B, n 3 | **not yet a P5 reading**: all three loads predate the P5 commit. The first post-P5 load is the next compaction or restart |
| expected per-start drop | P0 medians (CC-A/B/C ~195.6k; unmapped 171.5k) minus 44,783 | ~150.8k mapped, ~126.7k unmapped | **calculation, not a measurement**; confirm at the first post-P5 loads of each session |
| building tokens per active crew-hour | building sessions, this window | not meaningful: the four building sessions are stopped (usage stop since 11-16); only PM ran | leg A's 20-crew-hour read waits for the crew's resume |
| move ledger and cap checks | repo at `198e6ddcb` and in CI run 44567580494 | ledger OK (55 moves, one home each); cap 77,480/78,000 | **measured** |

P8 (`6bfb3613d`) is text only: the four PM handover skills name the settings and the smoke check (OBJ-9 proof: each names them at the ref).

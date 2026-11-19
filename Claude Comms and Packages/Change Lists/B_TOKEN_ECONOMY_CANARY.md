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

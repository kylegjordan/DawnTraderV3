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

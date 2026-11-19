# B-TOKEN-ECONOMY P5 — how every moved rule is still reached (Claude and Codex)

P5 cut `CLAUDE.md` from 122,263 B to 77,480 B (LF bytes) by moving 55 passages out, word for word. This sheet answers one question for each: **how does a session that needs that rule get to it?**

## The one path that covers all 55

Every moved passage left a **pointer line** in `CLAUDE.md` at the spot it came from. The pointer:

1. restates the operative rule in short form, so the rule itself still loads; and
2. ends with `` `<FILE>.md` · `P5-NN` ``, naming the file and the block id.

The full passage sits in that file between `<!-- P5-MOVED id=P5-NN -->` and `<!-- /P5-MOVED id=P5-NN -->`. Searching the repo for the id finds it in one step.

| reader | how `CLAUDE.md` arrives | how the moved text is reached |
|---|---|---|
| **Claude session** | auto-loaded at start and on every compaction | follow the pointer: `Grep "P5-NN"`, or open the named file and find the id |
| **Codex session** | `AGENTS.md` step 2 tells it to read `CLAUDE.md` (Codex auto-loads `AGENTS.md`, not `CLAUDE.md`) | the same pointer: `rg "P5-NN"`, or open the named file |
| **Langston / Coltrane** | read the diff at the review ref | the ledger lists every move with its destination and hash |

Nothing moved into a place only one crew can see: every destination is a tracked repo file. The one skill destination (`workflow-10-governance`, `P5-44`) is a plain Markdown file that Codex reads by path at Step 10 under `AGENTS.md` step 4, just as Claude does.

## Where they went

| destination | moves | what kind of text |
|---|---|---|
| `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` | 27 | why each rule exists: origin stories and measured cases |
| `1-system-manual/COMMS_BRIDGE_RUNBOOK.md` | 7 | Discord posting mechanics, backend switch, scp multi-line, image relay |
| `1-system-manual/REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` | 6 | backups, who moves what, staging server and URL detail |
| `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` | 4 | session naming status, wake mechanics, Remote Control |
| `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` | 3 | memory junction setup, per-session memory |
| `1-system-manual/LANGSTON_ARCHITECTURE.md` | 3 | Langston's runtime, his statelessness, OpenClaw history |
| `1-system-manual/ALERT_HANDLING_PROTOCOL.md` | 1 | what happens after an alert is diagnosed |
| `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md` | 1 | the daily model check's procedure |
| `1-system-manual/CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK.md` | 1 | the scheduled-routine permission regression |
| `1-system-manual/DELIVERY_BOARD_PROTOCOL.md` | 1 | delivery board rules |
| `.claude/skills/workflow-10-governance/SKILL.md` | 1 | the "reorganising is not updating" anti-pattern, at the step it fires |

The per-passage list (id, origin heading, destination, sha256, byte count, pointer text) is the ledger: `B_TOKEN_ECONOMY_MOVE_LEDGER.json`, same folder.

## What stayed in `CLAUDE.md` on purpose

Every heading (44 before, 44 after), every hard rule's operative sentence, the §10.5 alert read (`due-alerts.py`), the §6.6 inbox read, the staging command block, the batch-close sync gate, and all of §9.4's disposition table. Those fire before a session would think to look anything up.

## How we know nothing was lost

- `node scripts/crew-tooling/move-ledger-check.mjs --dupes` — every passage is at its destination exactly once, byte-identical to what left (sha256), gone from `CLAUDE.md`, its pointer id still in `CLAUDE.md`, and found in no second home. `--self-test` proves it fails on a missing passage, an edited one, one put back, and a lost pointer.
- `node scripts/crew-tooling/claude-md-cap.mjs --report` — the size against the 78,000 B cap. Runs at every Claude session start (silent under the cap) and in CI for both crews, warn-only (Langston, Step 4: a size gate that blocks honest work teaches the crew to route around it). The `move-ledger-check --dupes` line is BLOCKING in CI from Step 4.
- `scripts/measure-gate/test-guard-measurement-shape.mjs` M0 — still finds the mandated commands in all three homes (`CLAUDE.md`, `MEMORY.md`, `settings.local.json`).

## Line-number citations

109 `CLAUDE.md:<line>` citations exist in the repo (corrected at Step 4, Langston: the earlier 107 was the frozen count relabelled as the total). Two were live (a skill and a test) and now cite the section by name. The other 107, at 95 distinct sites, sit in frozen records (issue entries, plan rows, completion reports) and are **mapped in the ledger, not rewritten**: each one resolves against `CLAUDE.md` as of the commit that wrote it, and the ledger shows where the pre-P5 line now lives.

## Flagged for Langston at Step 4

- `P5-34` moved §7.1's old crew-board paragraph ("claim shared paths") to the history doc; its pointer says it is superseded by rule 25.a (the board was retired 2026-08-23). Confirm that is a move and not a rule change.
- Frozen citations mapped rather than rewritten, as above.

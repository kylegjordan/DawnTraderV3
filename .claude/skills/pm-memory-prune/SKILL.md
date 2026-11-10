---
name: pm-memory-prune
description: ONLY for moving whole closed or stale PM notebook items into the dated git archive when MEMORY_PM.md passes about 8 KB. NOT for deleting history, shortening active state, paraphrasing moved items or pruning another session's memory.
---

# PM memory prune

The notebook should carry current position, active waits, pending Kyle decisions and live stop or transition state. The archive carries closed and stale history without loss. The hard notebook cap is 10,240 bytes; start pruning at about 8,192 bytes.

## Select whole items

Read the entire notebook and the current handover first. Never move an active CURRENT POSITION, active usage stop, unresolved Kyle ask, live nudge, or the only record of a scheduled task that must be restored.

Bracket each complete item or contiguous group to move without editing its contents:

```markdown
<!-- PM-PRUNE-BEGIN id=short-stable-id date=YYYY-MM-DD -->
<whole dated item or section>
<!-- PM-PRUNE-END -->
```

Closed means its outcome is recorded. Stale means its authoritative state now lives in a cited decision, register, handover, plan or completion report and it is no longer needed in loaded context. Never select only part of a bullet or combine active and closed facts in one selection.

## Run and verify

From the repository root:

`node .claude/skills/pm-memory-prune/scripts/prune-memory.mjs --source .claude/memory/MEMORY_PM.md --archive 1-system-manual/pm/archive/memory/<YYYY-MM>.md --threshold 8192`

The helper refuses malformed or duplicate markers. Above threshold it appends each payload byte-for-byte under its date and id, replaces it with one pointer, then verifies every moved payload is present once in the archive and absent from the notebook. Under threshold it moves nothing. Run `--self-test` after changing the helper.

Update `1-system-manual/pm/INDEX.md` when a monthly archive file is first created. Measure both working files, then after push measure the committed copies with `git show <ref>:<path>`.

Claude PM and Codex PM use the same repo helper and archive. Their scheduling differs: Claude re-enables only its recorded Claude scheduled pruning task after a usage stop; Codex resumes only the exact Codex automation recorded by its stop. Neither PM creates or re-enables a schedule merely because a manual prune ran.

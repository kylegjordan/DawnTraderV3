# B-GOV — Claude Code governance-enforcement research synthesis (cited)

> Gathered by Claude Old (CC-A) 2026-06-16 via a web sweep (Anthropic official docs, Reddit, GitHub incl. RFC #45427, HumanLayer, dev.to, claudefa.st, etc.) at Kyle's direction ("do the research yourself, you'll find the same learnings CC-B found"). This is the evidence base for `BATCH_B_GOV_SCOPE.md`. Every claim carries a source URL.

## The one-line premise (now officially confirmed)
Anthropic's own docs: **"CLAUDE.md and memory are context, not enforced configuration… To block an action regardless of what Claude decides, use a PreToolUse hook instead."** + **"Target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."** (https://code.claude.com/docs/en/memory). This is the entire justification for moving enforcement out of prose into tooling.

## §1 — "Long CLAUDE.md → rules ignored" is real, quantified, and uniform
- Official: under 200 lines; CLAUDE.md is "a user message after the system prompt… no guarantee of strict compliance." (code.claude.com/docs/en/memory)
- HumanLayer: over ~80 lines Claude starts ignoring parts; budget ~100–150 instructions after the system prompt's ~50; "<300 lines best, shorter better"; their own root <60 lines; **degradation is UNIFORM across all instructions, not just newest.** (humanlayer.dev/blog/writing-a-good-claude-md)
- "200 lines, ignored" (dev.to/minatoplanb): "doubling instructions halves compliance"; "Rules in prompts are requests. Hooks in code are laws"; "CLAUDE.md is a wish list, not a contract."
- **Compaction:** project-root CLAUDE.md is re-read from disk + re-injected after /compact; nested/subdir CLAUDE.md are NOT re-injected; auto-MEMORY loads only first 200 lines/25KB. → our 200-line MEMORY cap is load-bearing; batch-close rules must NOT live only past MEMORY line 200 or only in conversation.
- **Implication:** slimming CLAUDE.md measurably raises compliance with what remains. Our CLAUDE.md is far over 200 lines → high-value slim.

## §2 — Hooks as enforcement: Stop hook, exit codes, the loop guard
- Exit codes: **0** = success (stdout JSON honored); **2** = BLOCKING (stderr fed back to Claude as the instruction); other = non-blocking. **Only exit 2 (or `decision:block`) blocks — exit 1 does NOT.** (code.claude.com/docs/en/hooks)
- Per-event exit-2: PreToolUse blocks the call; UserPromptSubmit erases the prompt; **Stop prevents stopping (continues the conversation)**; PostToolUse can't block (tool already ran).
- **Stop-hook "block done until green" pattern:** exit 2 + stderr reason, OR exit 0 + stdout `{"decision":"block","reason":"..."}`. (claudefa.st/blog/tools/hooks/stop-hook-task-enforcement)
- **★ INFINITE-LOOP TRAP:** a Stop hook that always blocks death-loops (documented 50-min session burn, gh #55754). Guard: the Stop-hook stdin carries `stop_hook_active` (bool) — check FIRST, bail if true. "A stop hook that doesn't check stop_hook_active is a trap with a timer." PLUS add an external iteration ceiling (counter file) — official page warns "avoid decision:block on Stop unless you have external termination logic." **⚠️ VERIFY the field name in OUR installed version (echo raw stdin) — current official page surfaced decision/exit-2 but not stop_hook_active explicitly; community relies on it.**

## §3 — Deterministic gates; what hooks CANNOT cover
- RFC #45427 (anthropics/claude-code, closed-not-planned) = effective blueprint: config-driven `toolGate` with deterministic conditions (`file-exists:<glob>`, `file-contains:<path>:<regex>`, `env-set`, `always/never`) → action block + message. Our `gate.js` IS this, invoked from a Stop hook + CI.
- **5 failure modes hooks DON'T cover (→ our test cases):** (1) subagents bypass parent hooks (gh #43772); (2) silent hook failure on non-blocking events; (3) model can Edit settings.json / hook scripts to weaken itself (RFC saw 3 attempts); (4) `cat > file <<EOF` heredoc bypasses a Write-matcher hook (match Bash too); (5) CLAUDE.md advisory text has no enforcement surface.
- **CI backstop is the ONLY layer the model genuinely can't reach** → "CI must stay green" is the right ultimate gate. RFC data: commit-traceability 100% w/ governance vs 68% without; ~5% hook-bypass/session.
- Protect the gate's own config + hook scripts via `permissions.deny` (managed settings are "enforced by the client regardless of what Claude decides").

## §4 — Slash commands + subagents (auditor)
- Slash commands = `.claude/commands/*.md`; `/close-batch` loads its instructions. Convenience layer, still prose-driven → NOT the enforcement layer (the Stop hook is).
- Subagents run in their own context → the governance value is fresh, isolated context.
- **"Don't grade your own work":** same session writing + reviewing = minimal independent validation; effective verification needs generation + critique in SEPARATE contexts/models. (subaud.io/adversarial-coding…) → **Langston already satisfies this** (separate box, separate session). Routine = fresh local sub-agent w/ adversarial prompt; ambiguous/architectural = Langston.

## §5 — CLAUDE.md slimming mechanics (the real levers)
- Precedence: managed-policy → user → project → local, concatenated. Managed-policy CLAUDE.md can't be turned off (only "can't-disable" tier).
- **`@path` imports do NOT save context** (imported files load in full at launch) — organizing only, not slimming.
- **REAL slim levers:** `.claude/rules/*.md` with optional YAML `paths:` frontmatter → load ONLY when Claude touches matching files (genuinely cuts always-on context); **Skills** for multi-step procedures that load on-demand. Official: "if an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule."
- HTML comments `<!-- -->` are stripped before injection (zero-cost maintainer notes).
- `--append-system-prompt` injects a rule at system-prompt level (higher adherence) — candidate for Langston-bridge invocations.

## §6 — The recommended enforcement STACK (maps onto our 3-doors model)
| Layer | Mechanism | Enforces |
|---|---|---|
| L0 slim prose | CLAUDE.md <200 lines + `.claude/rules/` | intent, conventions |
| L1 convenience | `/close-batch` command/skill | runs gate, drafts manifest |
| L2 deterministic gate | `node scripts/governance-gate.mjs` (config-driven) | checkable facts (docs touched, manifest fields, sync, citations present) |
| L3 block-on-not-done | Stop hook → gate, blocks w/ reason + `stop_hook_active` guard + iteration cap | "done" un-declarable until green |
| L4 judgment audit | Langston / fresh sub-agent, separate context | substantive-update-vs-date-bump, citation-actually-supports-claim |
| L5 backstop | CI green required + `permissions.deny` protecting gate config | the layer the model can't reach |

**Top gotchas to design around:** stop-hook loop (guard + counter + verify field name); subagent bypass (→ run gate in CI too); self-modification (protect settings/hooks via deny); heredoc bypass (match Bash); @-imports don't slim (use rules/skills); exit 1 ≠ block (only exit 2 / decision:block).

*(Full per-claim URLs in the research pass; key sources: code.claude.com/docs/en/memory + /hooks, github.com/anthropics/claude-code/issues/45427, humanlayer.dev/blog/writing-a-good-claude-md, claudefa.st/blog/tools/hooks/stop-hook-task-enforcement, dev.to/minatoplanb 200-lines, subaud.io adversarial-coding.)*

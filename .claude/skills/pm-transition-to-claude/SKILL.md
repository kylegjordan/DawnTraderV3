---
name: pm-transition-to-claude
description: PM CODEX CREW HANDOVER TO CLAUDE ONLY - run the complete return from the Codex crew to the Claude crew after Kyle tells PM Codex in its chat to switch back. NOT for a usage stop and never runs on PM Codex's own judgement.
---

# PM Codex transition to Claude

Kyle's words in the PM Codex chat are the only trigger. PM Codex owns the preparation, order, receipts and follow-up. Kyle opens the Claude windows because nothing else can; he does not chase sessions or post a Discord switch command.

## 1. Prepare before the order

1. Run `crew-switch status`. Refuse to start a second transition while an order is open.
2. Read the CURRENT POSITION block in each Codex session's own memory file and the PM block in `MEMORY_PM.md`. Read Discord for open Coltrane reviews, open alerts by owner and answers that arrived after a session stopped.
3. Check all five clones (`old`, `new`, `analyst`, `infra`, `pm`) with `git fetch`, then record branch, dirty paths, and behind/ahead against `origin/migration/aws-supabase`. Never discard or overwrite a dirty path. A clone is ready only at a step boundary, with its position current and every owned change pushed.
4. Codex sessions cannot be woken or messaged from another Codex session. Post one complete Discord request naming every session that must hand over, then inspect its clone and memory. If a session must act, tell Kyle exactly which Codex chat to open; that is a handoff instruction, not work for Kyle to chase.
5. Write and push `1-system-manual/pm/handovers/<YYYY-MM-DD>_codex-to-claude.md`. Give each session its batch, step, next action, pushed ref, dirty/sync state, open reviews, timed checks, deploy holds and alerts. Include Kyle's pending decisions and every unanswered Coltrane review.
6. Update and push the PM handover block in `.claude/memory/MEMORY_PM.md`: the handover sheet, open KD acknowledgements, pending Kyle decisions, stopped Codex-side scheduled work and the next PM action.

Do not issue the order until every clone reads 0 behind / 0 ahead and the handover sheet plus PM block are pushed.

## 2. Issue and prove the order

1. Run `ssh root@204.168.141.77 'crew-switch start claude'`.
2. Run `crew-switch status`. It must say CLAUDE, list OLD Claude, NEW Claude, ANALYST Claude, Infra Claude and PM Claude on duty, and show the Langston bridge active/enabled. A failed line stops the transition; report the exact readback.
3. Tell Kyle to open these Claude windows: OLD, NEW, ANALYST, INFRA and PM. Give each the handover sheet name. Nothing can open them for him.
4. Chase the open order until every outgoing Codex receipt is recorded. A Codex session confirms with `crew-switch ack <order> "<name>"` after its own step-boundary and push checks. If a session is closed, verify its clone and position yourself and record that PM supplied the receipt, as the 2026-11-09 switch did.
5. Re-send every unanswered Coltrane review to Langston with the original ref, question, conditions and Coltrane context. Do not translate a review into a new claim.
6. Confirm each Claude session pulled, read its position and the handover sheet, and left its incoming receipt. Re-enable only the Claude-side scheduled items listed in the PM stop record; do not invent a fresh list.

## 3. Completion

Complete only when: the switch reads CLAUDE; Langston reads active/enabled; no outgoing receipt is missing; all five Claude sessions have either confirmed or are named to Kyle to open; every clone is synced; the handover sheet and PM block are pushed; and all open Coltrane reviews have a Langston dispatch. Report one plain-language completion line to Kyle with anything he still has to open.

---
name: pm-transition-to-claude
description: PM CODEX CREW HANDOVER TO CLAUDE ONLY - run the complete return from the Codex crew to the Claude crew after Kyle tells PM Codex in its chat to switch back. NOT for a usage stop and never runs on PM Codex's own judgement.
---

# PM Codex transition to Claude

Kyle's words in the PM Codex chat are the only trigger. PM Codex owns the preparation, order, receipts and follow-up. Kyle does not chase sessions or post a Discord switch command.

## 1. Prepare before the order

1. Run `crew-switch status`. Refuse to start a second transition while an order is open.
2. Read the CURRENT POSITION block in each Codex session's own memory file and the PM block in `MEMORY_PM.md`. Read Discord for open Coltrane reviews, open alerts by owner and answers that arrived after a session stopped.
3. Check all five clones (`old`, `new`, `analyst`, `infra`, `pm`) with `git fetch`, then record branch, dirty paths, and behind/ahead against `origin/migration/aws-supabase`. Never discard or overwrite a dirty path. A clone is ready only at a step boundary, with its position current and every owned change pushed.
4. Under KD-66, read and message every existing DawnTrader Codex chat directly with its handover instruction, then watch each chat and inspect its clone and memory. A message sent during a running turn waits until that turn ends, and an accepted message is not proof it was read or acted on; require a visible reply or the resulting boundary and push. Post the complete Discord request as the durable crew record, but do not ask Kyle to paste a message into or open an existing Codex chat.
5. Write and push `1-system-manual/pm/handovers/<YYYY-MM-DD>_codex-to-claude.md`. Give each session its batch, step, next action, pushed ref, dirty/sync state, open reviews, timed checks, deploy holds and alerts. Include Kyle's pending decisions and every unanswered Coltrane review.
6. Update and push the PM handover block in `.claude/memory/MEMORY_PM.md`: the handover sheet, open KD acknowledgements, pending Kyle decisions, stopped Codex-side scheduled work and the next PM action.

Do not issue the order until every clone reads 0 behind / 0 ahead and the handover sheet plus PM block are pushed.

## 2. Issue and prove the order

1. Run `ssh root@204.168.141.77 'crew-switch start claude'`.
2. Run `crew-switch status`. It must say CLAUDE, list OLD Claude, NEW Claude, ANALYST Claude, Infra Claude and PM Claude on duty, and show the Langston bridge active/enabled. A failed line stops the transition; report the exact readback.
3. Tell Kyle to send PM Claude one message: `We’re back on Claude. Handover sheet: <file>`. PM Claude then starts a turn in each existing OLD, NEW, ANALYST and Infra Claude session, points it to its section of the sheet, and watches for its visible pickup. Kyle does not open or message the four building sessions unless PM Claude reports that one no longer exists, is archived, or cannot be started because the Claude app is not open.
4. Chase the open order through the existing Codex chats until every outgoing receipt is recorded. A Codex session confirms with `crew-switch ack <order> "<name>"` after its own step-boundary and push checks; PM verifies the acted-on reply rather than treating delivery as receipt. If a session no longer exists, verify its clone and position yourself and record that PM supplied the receipt, as the 2026-11-09 switch did.
5. Re-send every unanswered Coltrane review to Langston with the original ref, question, conditions and Coltrane context. Do not translate a review into a new claim.
6. Confirm each Claude session pulled, read its position and the handover sheet, and left its incoming receipt. Re-enable only the Claude-side scheduled items listed in the PM stop record; do not invent a fresh list.

## 3. Completion

Complete only when: the switch reads CLAUDE; Langston reads active/enabled; no outgoing receipt is missing; Kyle's one message has started PM Claude; PM Claude has visibly confirmed that each existing building Claude session picked up the correct batch and step, or has named the single unavailable session Kyle must open; every clone is synced; the handover sheet and PM block are pushed; and all open Coltrane reviews have a Langston dispatch. Report one plain-language completion line to Kyle with only an unavailable session, if any.

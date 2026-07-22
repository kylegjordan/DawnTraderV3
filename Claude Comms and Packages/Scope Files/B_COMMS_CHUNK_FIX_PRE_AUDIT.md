# B-COMMS-CHUNK-FIX — STEP-2 PRE-AUDIT

> **Owner:** Claude Analyst (CC-C) — implementing under Kyle's 2026-07-21 GO. **Reviewer:** Langston (Step-2). **Change-class:** `non_architecture` (comms infra on Helsinki; NOT the CI'd app repo — no tsc/vitest/CI gate applies; deploy = edit + `systemctl restart`).
> **Scope doc:** `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` (Part 3 + Part 4 adoption).
> **All line refs read live on Helsinki `/opt/discord-bridges/` at 2026-07-22.**

## 1. ROOT CAUSE — CONFIRMED END-TO-END (three code facts, not inference)

**FACT 1 — the split.** `discord_common.py::_send_chunks()` is the ONE shared delivery loop (both `webhook_send()` and `rest_send()` funnel through it). `chunks = chunk_text(content)` splits at `MSG_LIMIT = 2000` **CHARS**, preferring a newline boundary, hard-cutting otherwise. Each chunk is posted as its **own Discord message** via a separate `_post_json`, `INTER_CHUNK_DELAY_S = 0.35` apart.

**FACT 2 — `first_id` is a LOG-ONLY artifact and NEVER reaches the receiver.** `_send_chunks` returns only `first_id = resp.get("id")` captured at `i == 0`. `discord-cc-bridge.py::send()` then **re-chunks the message a second time purely to write log rows**, stamping every row with that same `first_id`:
```python
first_id = dc.webhook_send(...)          # posts ALL chunks; returns chunk-0's id
for chunk in dc.chunk_text(message):     # SECOND chunking, log-only
    append_inbox("cc_outbound", message_id=first_id, text=chunk, ...)
```
⇒ The shared `first_id` exists **only inside the sender's outbound log**. On the wire, each chunk is an independent Discord message with its own distinct id. **The receiving bridge cannot group by `first_id` — it never sees it.**

**FACT 3 — the drop is PRE-ENQUEUE.** `discord-langston-bridge.py::on_message()` applies the address gate *before* the task is queued:
```python
elif author_is_cc_bot and ADDRESS_START_RE.match(content): pass
else: return                      # <-- chunk 2..N die HERE, never become tasks
```
`ADDRESS_START_RE = ^[\s*_~`>#:".\-]*langston\b` — anchored. Only chunk 0 carries the leading "Langston". ⇒ chunks 2..N are silently discarded before the queue.

**⇒ Net:** a >2000-char Langston dispatch delivers chunk 0 only. Proven live 2026-07-20 (a 2,734-char message: chunk 1 = 1,717 chars reached him, chunk 2 = 1,017 chars appears in the log **only** as `cc_outbound`, never ingested).

## 2. ★ ADJACENT DEFECT FOUND IN THIS PRE-AUDIT (same address-gate fragility family) — NEW
`_send_chunks` prepends the Kyle @-mention to the FIRST chunk:
```python
if mention_user_id: chunks[0] = f"<@{mention_user_id}> " + chunks[0]
```
The gate's permitted leading characters are whitespace + `* _ ~ ` > # : " . -`. **`<` is NOT among them.** ⇒ **any `--notify` message addressed to Langston fails `ADDRESS_START_RE.match` on chunk 0 and he never engages *at all*** — not a truncation, a total drop, even for a short message. Latent today because `--notify` is used for Kyle-facing posts; it becomes live the moment someone sends Langston a notify-flagged dispatch. **Recommend fixing in the same batch** (one-line: apply the mention AFTER the address token, or exempt the mention prefix in the gate regex). Langston to rule: same batch, or its own issue.

## 3. CORRECTED FIX — SEND + RECEIVE (supersedes "(B) is pure-receive")
- **SEND — `discord_common.py::_send_chunks()` (ONE site, covers every sender):** when `len(chunks) > 1`, stamp a machine-parseable group marker on each chunk (e.g. a trailing `⟨grp=<uuid8> 2/3⟩`), and ensure **every** chunk still satisfies the receiver's address gate (re-prepend the address token on continuation chunks).
- **RECEIVE — `discord-langston-bridge.py::on_message()`:** parse the marker; buffer chunks by `grp`; enqueue **ONE concatenated task** when `i == n` arrives, with a bounded timeout as a safety net (never the primary key). Reassembly happens BEFORE the address gate so chunk 0's "Langston" covers the whole reassembled message.
- **Why not (A) alone:** it stops the drop, but Langston is stateless per-invoke — he'd get N disconnected `claude -p` invokes and rule on partial input. Coherence requires reassembly.

## 4. BLAST RADIUS — `_send_chunks` IS SHARED; this is the risk to manage
It is the delivery path for **every** poster: CC sessions (webhook), Langston's own replies (REST), and the §10.5 system-alerts webhook. Therefore:
- **R1 — cosmetic leakage:** a visible marker appears in Kyle's Discord view on any long message. **Mitigation: stamp the marker ONLY when the message is Langston-addressed** (chunk 0 matches the address pattern), leaving Kyle-facing and alert traffic byte-identical to today.
- **R2 — alert path must stay intact:** `is_alert` (dedicated `alerts_webhook_id`) **bypasses** the address gate unconditionally (OBJ-5, Langston-approved). The receive-side reassembly must not intercept or delay alerts. **Mitigation: alerts short-circuit before the buffer.**
- **R3 — Kyle's own messages** use `ADDRESS_RE` (name anywhere), not `ADDRESS_START_RE` — unaffected by the gate change, but must not be swallowed by the buffer. **Mitigation: buffer applies only to CC-bot-authored marked chunks.**
- **R4 — dedup/ordering:** `on_message` dedups on `message.id` and the worker is a single FIFO; the 0.35s inter-chunk delay makes out-of-order arrival unlikely but the group-id keying must not ASSUME order.
- **R5 — partial-group starvation:** if a middle chunk is never delivered, the buffer must time out and flush what it has (with an explicit "incomplete group" note) rather than silently hold — the fail-loud principle; a silently-held group is the same silent-drop class we are fixing.

## 5. WHAT I AM NOT CHANGING
`chunk_text` / `MSG_LIMIT` (2000 is Discord's hard cap, not ours to raise); the dedup ring; the circuit breaker; the queue/self-advance logic; the log schema (`first_id` stays as-is for log grouping — it is fine for THAT purpose).

## 6. OPEN QUESTIONS FOR LANGSTON (Step-2 ruling)
1. **Marker form + visibility** — trailing `⟨grp=… k/n⟩` vs a zero-width/invisible sentinel. Trailing-visible is auditable (I lean visible, Langston-addressed-only per R1); invisible is cleaner for Kyle but unauditable in the channel.
2. **§2 adjacent notify-mention defect** — fix in this batch (recommended: it's one line and the same gate) or split to its own issue?
3. **Buffer timeout value** and the incomplete-group flush behaviour (R5).
4. Confirm **`non_architecture`** class + that Helsinki-infra deploy (edit + `systemctl restart discord-*-bridge`) is the right gate, with no CI/staging step.

## 7. INTERIM MITIGATION — STAYS IN FORCE UNTIL THIS SHIPS
Keep any Langston dispatch **< 2000 CHARS** (watch chars, not bytes — `★ → ⇒ —` inflate bytes) or go file-first (stage to `/home/langston/inbox/`, send a short pointer LEADING with "Langston").

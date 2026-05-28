# B-NEW-46 — Langston alert-response relay to Telegram + exit-code capture

**From:** CC
**To:** Langston (Step 1 + Step 4 review) + Kyle (decider)
**Date:** 2026-05-28
**Status:** Step 1 — scope draft. Autonomous run (Kyle away, reading on Telegram; authorized the fix "that's another fix that needs to be done").
**Type:** Code change to the alert dispatcher's Langston-invoke path + one new Helsinki-side wrapper script.

---

## §0 — Why this exists (the gap Kyle caught 2026-05-28)

B-NEW-45 made scheduled alerts reach Langston automatically (verified in production 02:49Z → Langston ACK 02:53Z on the SCORING/TEC verify-gate). But Langston's handling is INVISIBLE to Kyle: Langston processes the alert, marks it acknowledged on the staging server, and writes his reasoning to `/var/log/langston-alert-invokes.log` on Helsinki — but NOTHING posts to Telegram. Kyle sees the alert fire (dispatcher posts it to topic 21), then silence. He has no way to see that Langston picked it up or what action Langston took/recommends.

Kyle's requirement: Langston's alert-handling must produce a VISIBLE Telegram response — "Langston here, re: [alert], I'm working on this / here's the action being taken / here's what we need to do." Turn the silent system-flag into a visible confirmation.

---

## §1 — Scope

### 1.1 Part A — Langston's alert response relays to Telegram (the core fix)

When the dispatcher invokes Langston for an active alert, after Langston's `claude -p` session produces its response, that response posts to Telegram topic 21 via `@LangstonDTBot` (Langston's own outbound bot, token at `/etc/langston/telegram-bot.env`), prefixed `**LANGSTON SPEAKING (alert response):** re: <alert title> — <response>`. Kyle reads it alongside ordinary thread traffic.

### 1.2 Part B — Prompt change so Langston's response is actionable

The current invoke prompt asks Langston to "review per §10.5 and surface to Kyle if action is needed." Extend it to explicitly request a concise plain-language response stating: (1) acknowledged + what the alert means, (2) the action Langston is taking or recommending (or "no action needed, here's why"). This response is what relays to Kyle, so it must be plain-language + self-contained.

### 1.3 Part C — Exit-code capture on the dispatcher spawn (Langston Q4.a from B-NEW-45)

The dispatcher's fire-and-forget `spawn()` currently swallows SSH-level failures (the exact reason the credential gap went undetected for 5 days). Add an `on('exit', code => ...)` handler that logs non-zero exits to `/var/log/dawntrader/system-alerts-dispatcher.log`. Keep fire-and-forget semantics (don't block the dispatcher) — the handler just records the exit code asynchronously.

### 1.4 Implementation approach — Helsinki wrapper script (recommended)

Rather than building an increasingly gnarly inline bash string in `invokeLangstonForAlert()` (claude-cli + response-capture + truncation + curl-relay all escaped through `JSON.stringify` + `sudo -u langston bash -c '...'`), introduce a dedicated wrapper script:

- **NEW (source in repo for version control):** `infra/helsinki/langston-alert-handler.sh` — takes alert id/title/severity/category/body as args (or via env), runs the `claude -p` session, appends the response to the invoke log, and relays the response to Telegram topic 21 via `@LangstonDTBot` (with ~3500-char truncation + plain-text mode to dodge the Markdown parse-entity errors seen in B-NEW-43 Phase 4).
- **Deployed to:** `/usr/local/bin/langston-alert-handler.sh` on Helsinki (mode 750, owned by root, runnable via the existing `sudo -u langston` path) — same deployment pattern as the bridge scripts that already live on Helsinki outside the repo.
- **MODIFY `scripts/system-alerts.ts` `invokeLangstonForAlert()`:** simplify the `remoteCmd` to call the wrapper with the alert fields as arguments; add the Part C exit-code handler on the spawn.

This keeps the JS side small + readable, puts the bash logic in a proper testable script file, and version-controls the handler source.

---

## §2 — Out of scope

- Recurring weekly health-check alert (the §3.R2.followup from B-NEW-45) — separate later piece. Not blocking Kyle's visibility ask.
- Privilege-of-least restructure (deploy@staging→langston@Helsinki direct) — still deferred.
- Changing WHICH alerts invoke Langston (still warning+critical, info skipped) — unchanged.

---

## §3 — Verification (Step 7)

Synthesized end-to-end test alert (same pattern as B-NEW-45 Step E):
1. Add a test alert with triggers_at ~2 min future.
2. Let the systemd cron promote it (no manual fire-due).
3. Confirm: (a) dispatcher log shows Langston-invoke spawned + exit-code 0; (b) Helsinki invoke log gets Langston's response; (c) **Telegram topic 21 receives a `LANGSTON SPEAKING (alert response)` message** — the actual new behavior; (d) alert acknowledged on the server.
4. Langston Step 8 independent confirmation his response landed in the thread.

---

## §4 — Questions for Langston Step 1 review

**Q1.** Wrapper-script approach (source in `infra/helsinki/`, deployed to `/usr/local/bin/`) vs keeping it inline in the JS `remoteCmd`? CC lean: wrapper script (maintainable, version-controlled, dodges escaping hell).

**Q2.** Relay target — topic 21 (group thread, where Kyle reads alongside CC↔Langston traffic) vs Kyle's DM? CC lean: topic 21, since that's where the alert itself already posts (keeps alert + response together).

**Q3.** Should the relay fire for ALL warning+critical alerts, or only when Langston's response indicates action needed (i.e., suppress "no action needed" responses to reduce noise)? CC lean: relay ALL — Kyle explicitly wants to see "yep I'm working on this" even for no-action confirmations, so silence is never ambiguous.

**Q4.** Response length cap — 3500 chars + truncation marker, or chunk into multiple Telegram messages for long responses? CC lean: 3500 + truncation (alert responses should be concise; full reasoning stays in the invoke log).

**Q5.** Anything else worth catching before Step 3?

**Reply format:** numbered point-by-point on Q1-Q5. ACK clean → CC proceeds to Step 3 implementation.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-new-46/B_NEW_46_SCOPE.md` after SCP. The current `invokeLangstonForAlert()` is in `scripts/system-alerts.ts` lines 186-221 (embedded below for reference).

```ts
// CURRENT (B-NEW-45 era) — fire-and-forget, no response relay, no exit-code capture:
async function invokeLangstonForAlert(alert: SystemAlert): Promise<void> {
  if (process.env.LANGSTON_INVOKE === '0') { ...skip... }
  if (alert.severity === 'info') return;
  const { spawn } = await import('node:child_process');
  const prompt = `SYSTEM ALERT promoted to active. Please review ... Body: ${alert.body.slice(0, 1500)}`;
  const remoteCmd =
    `sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=$(cat /etc/langston/oauth.env | cut -d= -f2-) && ` +
    `export HOME=/home/langston && cd /home/langston && ` +
    `FRESH_UUID=$(python3 -c "import uuid; print(uuid.uuid4())") && ` +
    `timeout 600 /usr/bin/claude -p --session-id $FRESH_UUID --model claude-opus-4-7 --permission-mode bypassPermissions ` +
    `${JSON.stringify(prompt)} >> /var/log/langston-alert-invokes.log 2>&1'`;
  const child = spawn('ssh', ['-o','StrictHostKeyChecking=no','-o','ConnectTimeout=10','root@204.168.141.77', remoteCmd], { stdio: 'ignore', detached: true });
  child.unref();
  console.log(`[fire-due] Langston invoke spawned for alert ${alert.id} (fire-and-forget)`);
}
```

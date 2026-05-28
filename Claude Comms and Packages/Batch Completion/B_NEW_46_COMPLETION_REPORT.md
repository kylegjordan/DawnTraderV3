# B-NEW-46 Completion Report — Langston alert-response relay to Telegram + exit-code capture

**Batch:** B-NEW-46
**Type:** Code change (dispatcher) + new Helsinki wrapper script.
**Status:** ✅ CLOSED — verified end-to-end via both a direct wrapper invoke (relay HTTP=200 at 11:10:27Z) AND a cron-fired alert through the full dispatcher path (relay HTTP=200 at 11:20:22Z) on 2026-05-28.
**Authorized by:** Kyle directive 2026-05-28 — "that's another fix that needs to be done" (Langston's alert handling was invisible to Kyle in Telegram).

---

## §0 — Headline (plain language)

When a scheduled alert reaches Langston, his response now posts back to the Telegram thread automatically — "Langston here, re: [alert], here's the action." Before this, Langston would process an alert and mark it handled on the server, but write his reasoning only to a log on his own machine, so Kyle saw the alert fire and then silence. Now Kyle gets a visible confirmation every time. Verified with two live test alerts — one direct, one fired by the normal scheduler — both posted Langston's response to the thread successfully.

The fix also closes a reliability gap Langston flagged earlier: if the alert hand-off to Langston ever fails (the AI helper's machine unreachable, a session error, a timeout), the system now posts an explicit "INVOKE FAILED" notice to the thread instead of leaving Kyle with ambiguous silence — so the absence of a response always means something specific.

---

## §1 — What shipped

| File | Type | Purpose |
|---|---|---|
| `infra/helsinki/langston-alert-handler.sh` | NEW (deployed to `/usr/local/bin/`) | Wrapper: runs the Langston claude-cli alert session, logs the response, relays it to Telegram topic 21 via `@LangstonDTBot`. Failure-case relay (5a), verbatim-to-Kyle prompt (5b), relay-HTTP logging (5c), bot-identity assert (5d), alert-anchored prompt (5e). Plain-text + 3500-char truncation. |
| `infra/helsinki/deploy-langston-alert-handler.sh` | NEW | Reproducible deploy: CR-strip transfer + `chown root:langston` + `chmod 750` + `bash -n` syntax check. |
| `scripts/system-alerts.ts` `invokeLangstonForAlert()` | MODIFY | Delegates to the wrapper via a fast SSH that launches it detached (`setsid`) on Helsinki; awaits the (now-fast) SSH + captures exit code (Part C). New `shellSingleQuote()` helper. |
| `.gitattributes` | MODIFY | `infra/helsinki/*.sh` pinned to `eol=lf`. |

---

## §2 — Verification (the proof)

Two independent end-to-end confirmations, both relay HTTP=200 to topic 21:

1. **Direct wrapper invoke** (alert `60cdfb05`, 11:10:27Z) — exercised the wrapper's claude-cli + relay logic after the permission fix.
2. **Cron-fired full path** (alert `1a17cc0c` "B-NEW-46 cron path final verification", 11:20:22Z) — the scheduler promoted the alert, the dispatcher launched the wrapper on Helsinki ("launched on Helsinki", no SSH-FAILED), Langston's response opened with the correct `re: 1a17cc0c B-NEW-46 cron path final verification` anchor, and relay HTTP=200.

Both test alerts ACKed. The cron-fired test specifically used a multi-word title AND body (per Langston's Step-4 ask) to exercise the exact failure mode the quote-nesting blocker hit.

---

## §3 — Iteration trail (3 blockers caught + fixed)

1. **Langston Step-4 quote-nesting blocker (caught pre-push).** The first cut wrapped the remote command in `bash -c '...'`, whose outer single-quotes collided with `shellSingleQuote`'s inner single-quotes — the alert title would truncate at its first space and the body would drop. Fixed by removing the `bash -c` wrapper (SSH already runs through a remote shell). Verified via remote-shell repro: argc=5, spaces intact. Would have shipped silently-wrong content without Langston's catch.
2. **CRLF line endings (caught at deploy).** Wrapper edited on the Windows mirror had CRLF; remote `bash -n` choked on `\r`. Fixed: `.gitattributes` pins `infra/helsinki/*.sh` to LF + the deploy script strips CR (`tr -d`) on transfer.
3. **File permission (caught at Step 7).** Wrapper deployed `root:root` mode 750; the dispatcher runs it via `sudo -u langston`, so langston fell into "others" with no execute → `setsid: Permission denied`. Fixed: `chown root:langston` so langston executes via the group bit.

---

## §4 — Workflow

| Step | Outcome |
|---|---|
| 1 scope + ACK | Langston ACK clean with 4 refinements (wrapper-script approach, topic-21 relay, relay-all, 3500-truncation) |
| 2 pre-audit | Folded into scope (current dispatcher code reviewed) |
| 3 implementation | Wrapper + deploy script + dispatcher modification |
| 4 code review | Langston caught quote-nesting blocker → fixed → final ACK clean |
| 5 push + CI | Code commit CI all-4-green (run 26570615325) |
| 6 deploy | Wrapper to Helsinki (2 deploy iterations: CRLF, perm) + staging dispatcher (PM2 #329) |
| 7 CC verify | Both test alerts relay HTTP=200 |
| 8 Langston verify | Dispatched (independent confirm of thread posts + wrapper deployment) |
| 9 iterate | 3 blockers fixed (§3) |
| 10 governance | This report + BATCH_CATALOG + PHASE_HISTORY + RUNNING_ISSUES + 3-way MEMORY |
| 11 completion | This file |

---

## §5 — Governance docs

- `1-system-manual/BATCH_CATALOG.md` — B-NEW-46 row
- `1-system-manual/PHASE_HISTORY.md` — closure note
- `1-system-manual/RUNNING_ISSUES.md` — Langston-alert-visibility gap noted CLOSED
- MEMORY (truth + in-repo + Helsinki)

CHANGES_AND_FIXES / SIM / System Manual: not applicable (comms-infrastructure, no app architecture/math/component change).

---

## §6 — Follow-ups

- **B-NEW-46.b (deferred):** recurring weekly synthesized health-check alert that exercises the full path so silent regression of the credential/wrapper chain surfaces within a week (§3.R2.followup from B-NEW-45). Now even more valuable since the relay path has more moving parts.
- **Privilege-of-least restructure (deferred):** direct `langston@Helsinki` instead of `root@Helsinki` + sudo. Per B-NEW-45 Q1.

---

## §7 — Commit chain

- `327e4f8` — B-NEW-46 code (wrapper + dispatcher) — CI green
- `17c50f4` — verify-gate governance close (interleaved)
- `16dd352` / `9966c59` — deploy-script perm fix + LF normalization
- [final governance commit pending — this report + catalog/history/memory]

---

*End B-NEW-46 completion report.*

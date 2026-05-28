# B-NEW-45 — Alert-dispatcher Langston SSH credential setup

**From:** CC
**To:** Langston (Step 1 + Step 4 review) + Kyle (decider)
**Date:** 2026-05-28
**Status:** Step 1 — scope draft. One-chunk operational batch.
**Type:** Infrastructure credential setup. No code change required. No behavioural change to the dispatcher itself — just makes the already-shipped Langston-invoke code path actually work end-to-end.

---

## §0 — Why this exists (the actual gap)

B-NEW-43 Phase 4 (2026-05-23, RUNNING_ISSUES #135) extended `scripts/system-alerts.ts fire-due` with two additions: (1) Telegram active-push so warning+critical alerts post to topic 21 via `@CCDTCommsBot`, and (2) an SSH+claude-cli invoke to Langston on Helsinki via fire-and-forget `spawn()`. The Telegram path is verified working. The Langston path was coded + the deny-path env flag `LANGSTON_INVOKE=0` exists for dev skip — but the SSH credential chain itself was never deployed. Result: `invokeLangstonForAlert()` runs on every promotion, the SSH child process spawns, fails silently (no key, no known_hosts), `/var/log/langston-alert-invokes.log` on Helsinki never gets written, Langston is never actually invoked.

This was surfaced today (2026-05-28) when Kyle asked whether Langston sees alert posts in Telegram. The platform-level bot-to-bot block confirms he does not (`@LangstonDTBot`'s `getUpdates` cannot see `@CCDTCommsBot`'s posts). Langston's only viable visibility path IS the SSH+claude-cli invoke that B-NEW-43 already wired. This batch closes that loop with the missing credential pieces.

Closing this gap is required for §10.5's per-turn alerts check to function on Langston's side without manual CC re-dispatch.

---

## §1 — Scope (one chunk)

### 1.1 Credential setup (3 ops steps)

**Step A — Generate keypair on staging deploy user.**

```bash
ssh root@188.245.193.8 "su - deploy -c 'ssh-keygen -t ed25519 -N \"\" -f /home/deploy/.ssh/id_ed25519 -C \"deploy@staging-188.245.193.8-alert-dispatcher\"'"
```

Result: ed25519 keypair at `/home/deploy/.ssh/{id_ed25519,id_ed25519.pub}`, comment `deploy@staging-188.245.193.8-alert-dispatcher` so the key purpose is self-documenting in Helsinki's auth_keys.

**Step B — Authorize on Helsinki root with IP restriction + command annotation.**

```bash
PUBKEY=$(ssh root@188.245.193.8 "cat /home/deploy/.ssh/id_ed25519.pub")
ssh root@204.168.141.77 "echo 'from=\"188.245.193.8\" $PUBKEY' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"
```

`from="188.245.193.8"` restriction means the key only works from staging's public IP — leaked key from any other host is rejected. No `command=` restriction because the dispatcher needs to run a multi-segment `sudo -u langston bash -c '...'` payload; restricting to a fixed `command=` would force a wrapper script which is more brittle than IP-restriction alone (and the privilege model is the same — deploy@staging→root@Helsinki, then sudo → langston).

**Step C — Pre-seed known_hosts so the first SSH doesn't fail on host-key prompt.**

```bash
ssh root@188.245.193.8 "su - deploy -c 'ssh-keyscan -H 204.168.141.77 >> /home/deploy/.ssh/known_hosts && chmod 600 /home/deploy/.ssh/known_hosts'"
```

The dispatcher already passes `-o StrictHostKeyChecking=no` for first-contact tolerance, but pre-seeding makes the connection less fragile if `StrictHostKeyChecking` ever flips back to default.

### 1.2 Verification (end-to-end)

**Step D — Direct SSH probe.** Confirm deploy@staging can reach root@Helsinki + sudo to langston:

```bash
ssh root@188.245.193.8 "su - deploy -c 'ssh -o ConnectTimeout=5 root@204.168.141.77 \"sudo -u langston whoami\"'"
```

Expected stdout: `langston`. Anything else = credential setup incomplete; iterate.

**Step E — Synthesized alert end-to-end.** Add a test alert with triggers_at slightly in the future, wait for the 15-min dispatcher cron tick to promote it, then verify both sides:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && npm run system-alerts -- add \
  --triggers-at \"$(date -u -d \"+2 minutes\" +%Y-%m-%dT%H:%M:%SZ)\" \
  --category soak_verification --severity warning \
  --title \"B-NEW-45 end-to-end verification\" \
  --body \"Test alert. Langston: please ACK with --by langston after you see this.\"'"
```

Wait ≥17 minutes. Then:
- Staging side: `ssh root@188.245.193.8 "tail /var/log/dawntrader/system-alerts-dispatcher.log"` — expect a `[fire-due] Langston invoke spawned for alert <id>` line.
- Helsinki side: `ssh root@204.168.141.77 "ls -la /var/log/langston-alert-invokes.log && tail -50 /var/log/langston-alert-invokes.log"` — expect a fresh Langston session output (whatever Langston wrote when he received the alert prompt).
- Alert state: `ssh root@188.245.193.8 "grep <id> /var/log/dawntrader/system-alerts.jsonl | jq ."` — expect `state: active` (and `state: acknowledged` if Langston ACKed).

### 1.3 Cleanup (governance trail)

- RUNNING_ISSUES #135 closure addendum: "B-NEW-43 Phase 4 active-push fix shipped 2026-05-23 included Langston-invoke wiring but the SSH credential chain was deployed in B-NEW-45 (2026-05-28)."
- CLAUDE.md §8 "Langston Operations Reference" gets a small addition documenting the staging→Helsinki SSH key as a known credential (mirrors the existing entry for Helsinki→staging key at §8 "Langston-side staging SSH").
- BATCH_CATALOG + PHASE_HISTORY + completion report per the usual 11-step close.

---

## §2 — Out of scope

- No code change to `scripts/system-alerts.ts` — the Langston-invoke path is already coded correctly. If end-to-end verification surfaces a code bug (e.g., the prompt format Langston receives is broken), iterate via a code-change Step 3 amendment.
- No new dispatcher logic (different transport, alternate routing). If we later want Langston's REPLY to also post to Telegram (so Kyle sees what Langston said in response to the alert), that's a separate B-NEW-46 batch.
- No security model rework. The current root+sudo-to-langston model is preserved. Privilege-of-least restructure to direct `langston@Helsinki` access is a possible future hardening but not required for v1.

---

## §3 — Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | A leaked deploy@staging private key gives an attacker root SSH on Helsinki | High | `from="188.245.193.8"` IP restriction in auth_keys — attacker must also control staging's public IP. |
| R2 | The fire-and-forget `spawn()` swallows SSH-level errors; if the credential breaks again (key rotation, IP change, sudo policy edit) the dispatcher silently fails like it does today | Medium | Verification Step E catches it during this batch; long-term mitigation = §3.R2.followup below — add a recurring health-check alert (e.g., once-weekly synthesized test alert + Langston-ACK gate) so silent regressions surface within a week. |
| R3 | Langston's invocation prompt format is broken (e.g., truncates the alert body too aggressively, or Langston doesn't know how to ACK) so he sees the alert but does nothing useful | Low | The prompt format was reviewed at B-NEW-43 Phase 4 design; if Step E verification shows Langston is confused, iterate the prompt as a Step 3 amendment to this batch. |
| R4 | The synthesized test alert in Step E is itself an `active` alert sitting in the file forever if Langston doesn't ACK it | Low | Manual ACK via `npm run system-alerts -- ack <id> --by cc-session-cleanup` at end of batch. Or just leave it as evidence in the completion report. |

### §3.R2.followup — recurring health-check alert (deferred to B-NEW-46 or absorbed into a quarterly hygiene batch)

A `recurrence_interval_seconds: 604800` (weekly) test alert that exercises the full path: dispatcher promotes → Telegram posts → Langston SSH invokes → ACK comes back. If the credential chain ever breaks again, this surfaces within a week instead of silently failing for months. Out of scope for B-NEW-45 because it requires alert-schema reuse logic that isn't load-bearing for the v1 fix.

---

## §4 — Step-by-step workflow position

- **Step 1 (this doc):** scope drafted, dispatched to Langston for ACK. Kyle directive 2026-05-28 selecting option (a) from the morning's alert-visibility discussion.
- **Step 2 pre-audit:** very thin — read the dispatcher script (already done, citations above), read RUNNING_ISSUES #135, confirm Telegram-side is healthy (done — most recent 14-day soak alert ACKed cleanly via topic 21 push). Author short pre-audit confirming the three operational steps will not conflict with any existing keypair / authorized_keys / known_hosts state.
- **Step 3 implementation:** run the three `ssh-keygen` / `authorized_keys append` / `known_hosts seed` commands per §1.1 above.
- **Step 4 code review:** no code diff (config-only batch). Langston reviews the actual `/root/.ssh/authorized_keys` line on Helsinki + the deploy@staging `.ssh/` directory listing for correctness.
- **Step 5 CI:** N/A — no code touched, no push. Skip CI verification gate explicitly noted in completion report.
- **Step 6 deploy:** N/A — no app code, no PM2 restart. Configuration changes already live as soon as `authorized_keys` is updated.
- **Step 7 CC first-pass verification:** Step D probe + Step E end-to-end synthesized alert test from §1.2.
- **Step 8 Langston second-pass verification:** Langston-side `ssh staging tail /var/log/dawntrader/system-alerts.jsonl` + Helsinki-side `tail /var/log/langston-alert-invokes.log` independent confirmation.
- **Step 9 iterate:** only if Step E fails.
- **Step 10 governance:** CLAUDE.md §8 add staging→Helsinki SSH key line; RUNNING_ISSUES #135 closure addendum; BATCH_CATALOG entry; PHASE_HISTORY note.
- **Step 11 completion report:** plain-language summary to Kyle.

---

## §5 — Questions for Langston Step 1 review

**Q1.** OK with the privilege model — staging's deploy user SSHes as root@Helsinki then `sudo -u langston`? Or want to restructure now to direct `langston@Helsinki` access (deploy@staging→langston@Helsinki, no sudo step)? Pros of restructure: privilege-of-least, no root credential on staging. Cons: dispatcher code in `scripts/system-alerts.ts` lines 207-217 has to change, which means a code Step 3 instead of config-only. **CC lean: keep root+sudo for v1**, restructure if it becomes load-bearing.

**Q2.** Privacy of `from=` IP restriction — is the staging public IP `188.245.193.8` stable enough (Hetzner static IPs do not rotate, but VM migration could) that hard-coding it in `authorized_keys` is fine? **CC read: yes**, Hetzner CPX22 IPs are static per the contract; if VM migrates to a new IP, this batch's `authorized_keys` line gets updated as part of that migration.

**Q3.** Synthesized test alert in Step E pollutes the alert log with a "test" entry. Acceptable, or want me to use a separate test-only flag / metadata key so future log-greppers can filter it out? **CC lean: acceptable**, the title `"B-NEW-45 end-to-end verification"` is self-documenting and the alert gets ACKed at the end of the batch.

**Q4.** Anything else worth catching before Step 3 (e.g., a `command=`-restricted wrapper script per OpenSSH best practice; an alternative to the fire-and-forget spawn that captures exit codes; a different log-rotation policy for `/var/log/langston-alert-invokes.log`)?

**Reply format:** numbered point-by-point on Q1-Q4. ACK clean → CC proceeds to Step 2 thin pre-audit then Step 3 ops execution.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b-new-45/B_NEW_45_SCOPE.md` after SCP. Use `ssh staging` for any /var/log/ inspection.

# B-NEW-45 Completion Report — Alert-dispatcher Langston SSH credential setup

**Batch:** B-NEW-45
**Type:** Config-only operational batch (with one inline systemd unit edit during Step 9 iteration).
**Status:** ✅ CLOSED — strictly verified end-to-end via cron-tick-driven test alert 2026-05-28 00:03:50Z, Langston ACK 00:04:07Z.
**Closing date:** 2026-05-28.
**Authorized by:** Kyle directive 2026-05-28 "go with option (a)" — extend dispatcher push to Langston via SSH.

---

## §0 — Headline result (plain language)

The alert system can now reach Langston automatically. When a scheduled reminder fires (the 14-day soak verifications, the 48h verify-gates already queued, future health-check pings), the system pushes the alert content directly into a Langston session via SSH, Langston reads it, and Langston acknowledges back to the system — all without anyone needing to be at the keyboard to notice a Telegram message. Verified end-to-end with a synthesized test alert that the systemd cron picked up at 00:03:50Z, processed in 17 seconds, and Langston confirmed back from his side.

The non-obvious part: there were TWO bugs sitting in the way, both inherited from the B-NEW-43 Phase 4 ship five days earlier (2026-05-23). First, the SSH credential chain from staging to Helsinki was never deployed — the dispatcher code was wired but the key pair was missing. Second, even after the credential was deployed, the systemd unit's default cleanup behavior was killing the detached SSH child before it could complete its round-trip. Both fixes landed in this batch as Step 3 + Step 9 iteration. The batch is now closed with all governance docs updated and the change committed to the migration branch.

---

## §1 — Objectives + outcomes

| # | Objective (from scope §1.1) | Outcome | Evidence |
|---|---|---|---|
| 1 | Generate ed25519 keypair on staging deploy user | ✅ DONE | `/home/deploy/.ssh/id_ed25519` + `.pub` with comment `deploy@staging-188.245.193.8-alert-dispatcher`. Fingerprint `SHA256:diAylFEGZCwBu3qwelXpLgXFDMbi1s8UWejwh4dMgjw`. |
| 2 | Authorize on Helsinki root with IP restriction | ✅ DONE | `/root/.ssh/authorized_keys` line 3: `from="188.245.193.8" ssh-ed25519 AAAAC3...bftn deploy@staging-188.245.193.8-alert-dispatcher` |
| 3 | Pre-seed known_hosts | ✅ DONE | `/home/deploy/.ssh/known_hosts` populated via `ssh-keyscan -H 204.168.141.77`. |
| 4 | Direct SSH probe (Step D) | ✅ DONE | `ssh root@204.168.141.77 "sudo -u langston whoami"` returns `langston`. |
| 5 | End-to-end synthesized alert (Step E) | ✅ DONE | 4 sequential test alerts; 4th was cron-tick-driven (no manual fire-due intervention) — `id 64790fff` promoted 00:03:50Z, Langston ACK 00:04:07Z. |
| 6 | Logrotate config on Helsinki (Q4.b add per Langston Step 1 ACK) | ✅ DONE | `/etc/logrotate.d/langston-alert-invokes` installed with `su root root` + `create 0644 langston langston` directives. `logrotate -d` dry-run validates clean. |
| 7 | Pre-create log file as langston owner (Step 9 iteration #1) | ✅ DONE | `/var/log/langston-alert-invokes.log` exists owned by langston, mode 644. Required because the dispatcher's `>> file` redirect runs as langston via sudo, but langston cannot CREATE files in /var/log/ (root:syslog 775). |
| 8 | systemd KillMode=process (Step 9 iteration #2) | ✅ DONE | `/etc/systemd/system/system-alerts-dispatcher.service` updated with `KillMode=process` directive. `daemon-reload` applied. Verified via cron-fire test (Objective #5). |

---

## §2 — Two bugs surfaced + resolved during Step 9 iteration

### 2.1 Bug #1: Log file did not exist + langston had no write to /var/log/

**Surfaced:** First test alert at 23:18:48Z fired the dispatcher successfully; the dispatcher spawned the SSH child to invoke Langston; the Helsinki log `/var/log/langston-alert-invokes.log` remained zero bytes after several minutes.

**Root cause:** The dispatcher's SSH-side bash command redirects claude-cli output via `>> /var/log/langston-alert-invokes.log 2>&1` (`scripts/system-alerts.ts:211`). This redirect runs as the `langston` user (via `sudo -u langston`). `langston` has no write permission to `/var/log/` itself, so it cannot CREATE the log file. The append would only work if the file already existed and was langston-writable.

**Fix:** Pre-create the file owned by langston with mode 644 (touch + chown + chmod). The logrotate config from Step 6 Q4.b uses `create 0644 langston langston` so future rotations re-create with correct ownership.

### 2.2 Bug #2: systemd KillMode=control-group killing detached SSH child

**Surfaced:** After Bug #1 was fixed, manual `npm run system-alerts -- fire-due` from an SSH session DID succeed end-to-end. But cron-driven invocations still produced no Helsinki log content.

**Root cause:** The dispatcher service unit has `Type=oneshot` with the default `KillMode=control-group`. When the npm process exits, systemd cleans the entire cgroup including the detached SSH child that was spawned with `{stdio: 'ignore', detached: true}` + `child.unref()`. The standard Node.js fire-and-forget orphan-to-init pattern does NOT survive systemd's cgroup-based cleanup. This bug was inherited from the B-NEW-43 Phase 4 ship — the SSH-invoke code was wired correctly but never worked in production because cgroup-cleanup killed it. The five-day silent failure window (2026-05-23 → 2026-05-28) was masked by fire-and-forget swallowing the SIGKILL signal.

**Fix:** Add `KillMode=process` to `/etc/systemd/system/system-alerts-dispatcher.service`. This kills only the main process (npm) on service exit, leaves detached children alive. `daemon-reload` applied; verified via the cron-fire-driven Objective #5.

---

## §3 — Verification chain (4 test alerts)

| # | Alert ID (prefix) | Trigger | Promote | Helsinki log | Outcome |
|---|---|---|---|---|---|
| 1 | `c61af286` | Manual via `npm run system-alerts -- add`, triggers_at 23:14:44Z | Cron 23:18:48Z | 0 bytes — silent SSH child loss | FAILED (Bug #1 + #2 both active) |
| 2 | `89753566` | Manual, triggers_at 23:21:38Z | Cron 23:33:49Z | 0 bytes — silent SSH child loss | FAILED (Bug #2 still active after Bug #1 fix) |
| 3 | `61398d6a` | Manual, triggers_at 23:39:10Z. **Manually fired via `fire-due`** (not cron) — bypasses systemd KillMode issue | Manual 23:39:16Z | Langston processed; ACK 23:40-ish | PASS (verified credential chain + log file work) |
| 4 | `64790fff` | Manual, triggers_at 23:55:40Z. **CC did NOT manually fire** — cron must pick it up | Cron 00:03:50Z | Langston processed; ACK 00:04:07Z | ✅ PASS (verified KillMode=process fix end-to-end) |

The 4th alert is the strictly-final verification. Cron-tick-driven, no manual intervention, full SSH→sudo→claude-cli→log path traversed under the new KillMode config. End-to-end latency 17 seconds.

---

## §4 — Workflow step-by-step

| Step | Activity | Status |
|---|---|---|
| 1 | Draft scope (`B_NEW_45_SCOPE.md`, dispatched to Langston) | ✅ |
| 1 ACK | Langston ACK clean with 4 refinements (Q4.a code-change to B-NEW-46.a; Q4.b logrotate add; Q5 VM-migration runbook note; concur Q1/Q2/Q3) | ✅ |
| 2 | Pre-audit (thin — verified telegram path healthy, dispatcher script reviewed, no conflicts with current state) | ✅ (folded into Step 3) |
| 3 | Implementation — ssh-keygen + authorized_keys append + known_hosts seed + logrotate config | ✅ |
| 4 | Code review | N/A — config-only batch, no code diff |
| 5 | CI | N/A — no code push |
| 6 | Deploy | N/A — config changes live immediately |
| 7 | CC first-pass verification (Step D probe + Step E synthesized alert) | ✅ — 4th test alert cron-driven |
| 8 | Langston second-pass verification | ✅ — Langston processed + ACK'd test alerts from his side, plain-language confirmation in Helsinki log |
| 9 | Iterate — Bug #1 (pre-create log file) + Bug #2 (systemd KillMode) | ✅ |
| 10 | Governance updates | THIS REPORT — see §5 |
| 11 | Completion report (this doc) + 3-way MEMORY sync | ✅ |

---

## §5 — Governance docs edited (Tier 1 + Tier 2 applicable)

| Doc | Edit |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | B-NEW-45 entry added |
| `1-system-manual/PHASE_HISTORY.md` | B-NEW-45 closure note appended to Phase 24 / pre-Phase-19 section |
| `1-system-manual/RUNNING_ISSUES.md` | #135 closure addendum noting B-NEW-43 Phase 4's SSH-invoke wiring was missing credential chain + KillMode; both resolved B-NEW-45 |
| `1-system-manual/CHANGES_AND_FIXES.md` | B-NEW-45 entry |
| `CLAUDE.md` §8 | Staging→Helsinki SSH key documented alongside existing Langston-side staging SSH entry |
| `.claude/memory/MEMORY.md` (in-repo persistence copy) | Updated + synced |
| `/Users/kyleg/.claude/projects/.../memory/MEMORY.md` (truth file) | Updated + synced |
| `/home/langston/MEMORY.md` (Helsinki) | Updated + synced per CLAUDE.md §10.b |

Not applicable for B-NEW-45 (no SIM/System Manual/MULTI_ASSET/ASSET_CLASS_ONBOARDING updates since the batch is comms-infrastructure, not architecture/math/component change).

---

## §6 — Operational gotchas (per Langston Step 1 ACK Q2)

1. **`from="188.245.193.8"` IP restriction** in Helsinki `/root/.ssh/authorized_keys`. If Hetzner CPX22 IP ever changes via VM migration, the dispatcher SSH will silently fail. Future migration runbook MUST update this line as part of the migration. Searchable evidence: this completion report + RUNNING_ISSUES #135 closure addendum.

2. **`/var/log/langston-alert-invokes.log` must exist with langston ownership.** Logrotate's `create 0644 langston langston` directive maintains this on rotation, but if the file is ever manually deleted, the next dispatcher invocation will silently fail. Mitigation candidate: dispatcher script could `mkdir -p && touch` the log file before the SSH spawn — deferred to B-NEW-46.a (code-change batch).

3. **`KillMode=process` is load-bearing.** If a future systemd unit edit reverts to default (control-group) without adding KillMode back, the cron-driven Langston-invoke silently breaks. Documented in the unit file's inline comment.

---

## §7 — Follow-up batches sequenced from this work

- **B-NEW-46.a (code-change):** Exit-code capture on the dispatcher's spawn() — add `on('exit', code => log(...))` handler so future SSH-level failures (auth, network, sudo policy edit) surface in the dispatcher log instead of disappearing. Per Langston Step 1 ACK Q4.a. ~3-line change.
- **B-NEW-46.b (config + scheduled alert):** Recurring weekly synthesized health-check alert that exercises the full path end-to-end so silent regression of the credential chain or systemd config surfaces within a week. Depends on B-NEW-46.a so failures actually log.
- **Privilege-of-least restructure (deferred):** Switch the dispatcher's SSH from `root@Helsinki` + sudo to direct `langston@Helsinki`. Per Langston Step 1 ACK Q1 — bundle with B-NEW-46 when it ships. Not load-bearing for B-NEW-45 closure.

---

## §8 — Pre-existing Telegram noise (not new, not in scope to fix)

The dispatcher's Telegram-side push has been logging `Bad Request: can't parse entities: Can't find end of the entity starting at byte offset N` on Markdown-formatted alert bodies that contain unescaped markdown characters. The B-NEW-43 Phase 4 hotfix retries with plain-mode parse on parse-failure, and the plain-mode retry succeeds silently. So Telegram delivery is operationally fine; the error line is verbose noise. Worth a small cleanup batch (escape Markdown-special chars in `formatAlertText`) but not load-bearing for B-NEW-45.

---

## §9 — Evidence locations

- **Dispatcher log:** `/var/log/dawntrader/system-alerts-dispatcher.log` (staging) — shows 4 `[fire-due] promoted` lines + 4 `Langston invoke spawned` lines
- **Helsinki invoke log:** `/var/log/langston-alert-invokes.log` (Helsinki) — shows `test_at_233731` from CC manual probe + Langston's plain-language ACK confirmation lines + 4th-alert ACK confirmation
- **Systemd unit:** `/etc/systemd/system/system-alerts-dispatcher.service` (staging) — shows `KillMode=process` directive with inline comment
- **Logrotate config:** `/etc/logrotate.d/langston-alert-invokes` (Helsinki) — shows `su root root` + `create 0644 langston langston`
- **SSH keypair:** `/home/deploy/.ssh/id_ed25519{,.pub}` (staging, mode 600/644) — fingerprint `SHA256:diAylFEGZCwBu3qwelXpLgXFDMbi1s8UWejwh4dMgjw`
- **Helsinki authorized_keys:** `/root/.ssh/authorized_keys` line 3 — IP-restricted entry for deploy@staging
- **Scope file:** `Claude Comms and Packages/Scope Files/B_NEW_45_SCOPE.md`
- **Pre-audit:** N/A (folded into scope §4 pre-audit-thin)
- **Test alert IDs:** `c61af286-055e-4f58-8fe4-9e3df8240f18` / `89753566-74e9-4beb-a886-435d127b23c0` / `61398d6a-b28a-4ae2-aa8d-cd26af3c2e6e` / `64790fff-a754-4351-983f-198a4e34cc90` — all `state: acknowledged` per `/var/log/dawntrader/system-alerts.jsonl`

---

*End B-NEW-45 completion report.*

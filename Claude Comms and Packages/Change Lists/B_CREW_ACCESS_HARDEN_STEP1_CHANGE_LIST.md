# B-CREW-ACCESS-HARDEN — STEP 1 CHANGE LIST

**Change-class:** `sub_batch`

**Owner:** Infra Claude / INFRA Codex

**Issues:** `#1092`, `#924`

**Review gate:** three independent Step-1 verdicts — OBJ-1 crew app privilege, OBJ-2 laptop key/key-holder, OBJ-3 server login hardening.

## Files in this review

1. `Claude Comms and Packages/Scope Files/B_CREW_ACCESS_HARDEN_SCOPE.md` — new scope with the ten-identity/three-credential-plane map, direct System Impact Map + System Manual read, tiered provenance, three objectives, checks, exclusions, sequence and stop conditions.
2. `1-system-manual/SPRINT_TO_LIVE_PLAN.md` — adds the directed sub-batch to §0 and marks exactly which pieces moved out of rows 85a and 158; the parent rows remain queued for their other work.
3. `1-system-manual/RUNNING_ISSUES.md` — records Kyle's ten-identity expansion and the bounded cross-parent sub-batch on `#1092`.
4. `.claude/memory/MEMORY_CC_INFRA.md` — positions INFRA Codex at Step 1, blocked on Coltrane after dispatch.
5. This change list.

## External board record

Delivery-board item `PVTI_lAHODmulEM4BfQP4zhAtr1o` was created with a plain-language description. API read-back shows `Status=Scope`, `Owner=Infra Claude`, `Type=Sub-batch`, `Issue=#1092 #924`, `Phase=Phase 19`, `Blocked on=Nothing`. Dispatch changes only `Blocked on` to the reviewer.

## Live reads used by the scope; no live writes made

- Staging users: `kylegjordan|owner|true`, `testuser|owner|true`, `testuser123|editor|true`.
- Shared laptop key: fingerprint `SHA256:8A/uD7…`, empty passphrase accepted; same unlabelled unrestricted fingerprint on staging root, staging deploy and Helsinki root.
- Effective authorization census: both hosts use only `.ssh/authorized_keys .ssh/authorized_keys2`, no key command and no `Match` blocks; four resolved files exist across login-capable accounts, and the old fingerprint occurs in exactly the three named files (dtmint is the positive non-match population).
- Windows OpenSSH agent stopped/disabled; PowerShell chooses Windows OpenSSH, Git Bash chooses its own client and has no agent socket.
- Bounded laptop census: the target keypair and one distinct Copilot keypair exist under Kyle's `.ssh`; no SSH config exists there. Step 2 must census every governed wrapper/profile before the old key and any bounded copies are retired.
- Staging effective SSH: password and keyboard-interactive auth off; public-key auth on. Helsinki: password auth on, keyboard-interactive off, public-key on; root/Langston/Coltrane/nova password states locked.
- Retained auth population: five files per box, 2026-09-13 through 2026-10-14. Accepted password: 0 on each. Positive controls: accepted public key 29,167 staging / 12,952 Helsinki. Helsinki failed-password lines: 378,557. These are retained-window counts, never “ever” counts.
- fail2ban binary absent and service inactive/not-found on both boxes.

## Scope-response record before dispatch

- Coltrane: uses neither the active-engine diagnostic scan nor Settings → Users; needs authenticated, non-mutating rendered staging pages/screenshots. Its repo review access is separate.
- ANALYST Codex: uses neither current path; needs authenticated read-only staging and batch-named analytical GET surfaces. It explicitly claimed no admin write need and bounded the scan answer to current work.
- INFRA Codex: uses neither path; its current checks use the sanctioned settings read, logs, service state and read-only database queries.
- The remaining seven named responses are a pre-implementation condition, not falsely recorded as present at Step 1.

## Reviewer questions — return three verdicts

1. **OBJ-1:** Does the non-admin crew-login plan preserve every required read while removing browser admin authority, and is the all-ten usage question an adequate execution gate?
2. **OBJ-2:** Is add/prove/cold-start/remove/retire with a complete effective authorization census, Windows OpenSSH agent, real wrapper-entry tests and authentication-log fingerprint proof the correct no-lockout design for the one physical key shared by eight identities?
3. **OBJ-3:** Is the one-host-at-a-time password-off + fail2ban plan bounded and falsifiable, including syntax plus per-context evaluation and a real disposable-source ban through the production `sshd` jail followed by unban and access re-proof?

## Review round 1 — Coltrane at `83dd24e120e12d245aabf2cb72f2e0bfb6e196da`

- **OBJ-1 APPROVED.** No scope change required.
- **OBJ-2 CORRECTIONS APPLIED.** The scope now carries the effective authorization census, a mandatory caller/wrapper census and real-entry proof, server-log fingerprint proof, a mandatory cold-start gate, zero old authorizations across the re-derived population, and retirement of the old private key plus bounded copies.
- **OBJ-3 CORRECTIONS APPLIED.** The scope now requires syntax validation and contextual evaluation for every required account/source plane, and replaces the alternate-jail option with a disposable source driving the real production `sshd` jail through ban, enforcement, unban and fresh-access proof.

## Review round 2 — Coltrane at `7dc4b4b34ab6609b46b5319b42d8021c0f70de0e`

- **OBJ-2 APPROVED.** Coltrane confirmed that the effective-authorization and governed-caller censuses, fingerprint proof, mandatory cold start, add-before-remove sequence and final absence controls close the round-one gaps.
- **OBJ-3 APPROVED.** Coltrane confirmed that syntax/context validation, retained recovery sessions and the real `sshd`-jail ban/unban/access proof close the round-one gaps.
- **Board limitation:** Coltrane explicitly reported that his review environment has no board-write path. INFRA Codex therefore recorded `Review=Approved` as an administrative transcription of his Discord verdict, then moved the owner-controlled fields to `Status=Pre-Audit` and `Blocked on=Nothing`; API read-back confirmed all three values.
- **CI:** exact shared ref run `38574073617` passed TypeScript Check, Test Suite, Build and Docker Build individually.

No code, database row, key, SSH configuration, package or live service is changed by this Step-1 commit.

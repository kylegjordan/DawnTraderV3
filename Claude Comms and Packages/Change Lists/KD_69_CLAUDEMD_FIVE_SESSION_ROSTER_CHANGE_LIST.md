# KD-69 / #1243 — `CLAUDE.md` five-session roster correction

**Owner:** CC-A / OLD Codex

**Decision:** KD-69 (Kyle, 2026-11-10)

**Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, stage `0 — clear the plates (CC-A)`, order `0a`

**Review gate:** Coltrane reviews the exact pushed ref before this item closes.

## Bounded purpose

Reconcile `CLAUDE.md` with the authoritative five-session roster and state, without ambiguity, the separate exact forms used for permanent session-ID binding and for Discord display/wake routing. This is the narrow governance correction approved by KD-69. It changes no crew tooling, wake code, sender code, deployment, trading code or runtime state.

## Authorities read

- `.claude/cc-session-roster.json` — permanent session-ID bindings and active status.
- `comms-infra/discord/address_list.py` — the shared opening-list aliases used by the Helsinki wake consumers; its `SESSION_NAMES` contains CC-A, CC-B, CC-C, CC-INFRA and CC-PM.
- `1-system-manual/RUNNING_ISSUES.md` `#1243` — the three recorded stale locations.
- `1-system-manual/pm/DECISIONS.md` KD-69 and `1-system-manual/SPRINT_TO_LIVE_PLAN.md` §0a order 0a — scope and placement.

## Exact mapping now stated in `CLAUDE.md`

| Alias | Registry name (session-ID binding) | Discord display / wake form |
|---|---|---|
| CC-A | `Claude Old` | `OLD Claude` |
| CC-B | `Claude New` | `NEW Claude` |
| CC-C | `Claude Analyst` | `ANALYST Claude` |
| CC-INFRA | `Infra Claude` | `Infra Claude` |
| CC-PM | `PM Claude` | `PM Claude` |

## Changed text

- §6 live-mechanics preamble: adds PM Claude and separates registry names from Discord/wake forms.
- §6 roles and live-channel description: replaces the obsolete two-session roster with all five roles.
- §6.4: lists all five exact `--sender` / wake forms and removes the invalid Discord form `Claude Analyst`.
- §6.9: replaces the stale two-row table with the five authoritative active bindings, updates current session IDs, and distinguishes binding authority from wake-form authority.
- §6.9 wake examples and §8 outbound summary: use the Discord/wake form and enumerate the five senders.

## Deliberately not changed

- No source, configuration, service, registry or routing implementation.
- No broader crew-tooling cleanup.
- No change to B-DB-SIZE-RELIEF or its deploy hold.
- No acknowledgement or resolution of database alert `c0a0b00d`.

## Verification before review

- `git diff --check` must pass.
- The roster must parse as five active rows with aliases `CC-A`, `CC-B`, `CC-C`, `CC-INFRA`, `CC-PM`.
- `address_list.py` must expose those same five aliases in `SESSION_NAMES`.
- The stale exact claims from `#1243` must be absent from the live §6/§6.4/§6.9 text, with nearby positive controls proving each search read the file.
- Only `CLAUDE.md` and this change list are included in the review commit.

## Coltrane result

Pending review of the exact pushed ref recorded in the Discord request.

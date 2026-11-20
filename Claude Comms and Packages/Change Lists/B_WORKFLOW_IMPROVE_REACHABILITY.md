# B-WORKFLOW-IMPROVE — Q7: how each crew reaches the audit-aid instructions (OBJ-8)

actor: PM Claude (session 994e6488) · role: implementer · STEP: 3 of 11 (task Q7) · 2026-11-20
Edits: commit `4265cb1df` plus the two Step-2 pointer lines in the commit that carries this file.

## The one home and its pointers
The aids' table, their standing (leads, never verdicts) and the pilot's limits list stand once, in `workflow-02-audit-and-plan`, section "THE AUDIT AIDS". Every other place names the aid it needs at that point and points there.

| instruction | where it stands | point of action |
|---|---|---|
| the table, standing and limits | `workflow-02-audit-and-plan`, "THE AUDIT AIDS" | writing the pre-audit |
| `census.mjs` for the census | `workflow-02`, first line under "§9.5(a) — COMPONENT CENSUS" | the per-hop census |
| `history.mjs` for the provenance read | `workflow-02`, first line under "6 — THE PROVENANCE READ" | the Step-2 provenance read |
| `history.mjs` for the provenance read | `workflow-01-scope`, under "MANDATORY 1.b" | the Step-1 provenance read |
| `census.mjs` and `code-refs.mjs` for blast radius | `workflow-hotfix`, after §2's five questions | the hotfix blast-radius audit |
| the aids are leads, never verdicts | `CLAUDE.md` §9.5 trigger, one sentence | an audit or architectural dispute with no step open |
| the shared contract and the CLIs | `AGENTS.md` §2 item 5 | Codex start-up read path |

| crew | how the instruction arrives |
|---|---|
| **Claude** | `CLAUDE.md` is auto-loaded, so the §9.5 sentence is always in context. Its §0.a table sends the session to the step file before each step, and the hotfix line sends it to `workflow-hotfix`. |
| **Codex** | `AGENTS.md` is auto-loaded. Item 5 names the aids and the shared contract. Item 2 has it read `CLAUDE.md` (the §9.5 sentence and the hotfix line), and item 4 has it read each step file by path. |

All destinations are tracked Markdown files that both crews read by path; nothing depends on Claude's skill machinery.

## Canary, 2026-11-20 (fresh reader, read from the working tree at `4265cb1df`)
A sonnet helper with no context walked eight paths, following only the documents' own pointers and not searching for the aid names: two entry files (`CLAUDE.md` for Claude, `AGENTS.md` for Codex) by four situations (Step-1 scope, Step-2 census, hotfix, a dispute with no batch open).

| crew | situation | reached | where |
|---|---|---|---|
| Claude | Step 1 provenance | yes | `workflow-01-scope` :27 |
| Claude | Step 2 census | yes | `workflow-02` "THE AUDIT AIDS" |
| Claude | hotfix | yes | `workflow-hotfix` :50 |
| Claude | dispute, no batch | yes | `CLAUDE.md` :459 |
| Codex path | Step 1 | yes | `AGENTS.md` :25, then `workflow-01` |
| Codex path | Step 2 | yes | `AGENTS.md` :25, then `workflow-02` |
| Codex path | hotfix | yes | `AGENTS.md` :25, `CLAUDE.md` :28, then `workflow-hotfix` |
| Codex path | dispute | yes | `AGENTS.md` :25, then `CLAUDE.md` :459 |

Every path reached text naming the aids and saying they are leads, not verdicts. No broken pointers.

**Gap it found, fixed in this commit:** in `workflow-02` the census section and the provenance section came before "THE AUDIT AIDS" and did not mention them, so a reader working one section at a time could miss the aids. Each now opens with a one-line pointer to the aid and its limits.

**Gaps it found, kept as they are (reasons stated):**
- The full limits list is in `workflow-02` only; Step 1 and the hotfix carry a short form and point there. That is the one-home rule, not a gap.
- `AGENTS.md` does not name the hotfix path itself; Codex reaches it through the `CLAUDE.md` line it is told to read. Same path Claude uses.

## Not proven, stated
- **The Codex rows are a Claude helper walking the Codex read path, not a Codex session.** The scope asks for a canary once per crew. The real Codex canary pairs with B-TOKEN-ECONOMY's pending OBJ-3 Codex canary, the next time a Codex session runs; until then OBJ-8's Codex leg is open.
- The canary read the working tree before the push. Line numbers above are from that tree; quote them from the ref after the push.

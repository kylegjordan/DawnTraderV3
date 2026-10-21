# Langston's rules file — per-section census (B-LANGSTON-CLAUDEMD-RESIDUAL, P4 / scope OBJ-3)

**Object:** `comms-infra/langston/LANGSTON_CLAUDE.md` at `9384b919a` = the live `/home/langston/CLAUDE.md` (sha256 `d6617e29…`, 67,896 B).
**Byte convention:** UTF-8 bytes from a `# `/`## ` heading line through the line before the next one, each line with its newline; the last section has no final newline. **The 26 rows sum to exactly 67,896 B.**
**Placement:** his core test (r1 Q2) — *a section is core if its trigger is something he cannot see coming.* Retire/compress items carry his ruling number from scope OBJ-4 and his measured delta. **No modules** (scope OBJ-4: only with a mechanical read check, which is not built). **Nothing is renumbered**: a retired numbered section keeps its heading with a one-line pointer.

| lines | bytes | section | trigger | placement | ruling | est. delta |
|---|---|---|---|---|---|---|
| 1-5 | 491 | title + `@MEMORY.md` import | always | core | — | 0 |
| 6-49 | 7,970 | ★★ How you read a governed artifact | any read of an artifact — unannounced | core: the invariant stays; the `dt-review` command mechanics go (every dispatch header carries them) | (i) | −1,132 (−1,836 if the `ssh staging` recipe block goes too) |
| 50-64 | 1,183 | §1 Who you are | always | core | — | 0 |
| 65-107 | 5,664 | §2 Personality and communication style | every Kyle-facing message | core persona bullets kept; the plain-language rule stated once plus the four questions | (iii) | −1,536 to −2,073 |
| 108-130 | 2,903 | §3 Expertise | none — descriptive | retire (heading + pointer kept) | (iv) | −2,903 + pointer |
| 131-152 | 1,918 | §4 The 11-step workflow | a named step | compress: it tells him to read the repo workflow, then restates it | (ix) | ~−918 |
| 153-214 | 7,121 | §5 Three-way communication (incl. 5.1 file-first, 5.2 voice, 5.3 wake routing) | a dispatch / a voice note / a wake | 5.2 voice retired; 5.3 compressed (the dead-alert-log history); 5.1 kept | (vii) (viii) | −609, ~−1,269 |
| 215-232 | 2,387 | §6 Management philosophy | review posture | core for now (his r1 Q2 listed it as a module candidate; no modules this batch) | — | 0 |
| 233-279 | 2,776 | §7 Prime invariant — task-completion honesty | unannounced | core | — | 0 |
| 280-295 | 2,876 | §8 Critical rules | unannounced | core | — | 0 |
| 296-311 | 1,593 | §9 Capabilities | tool choice | core; gains §18's one surviving line (never `find /`) | (ii) | +~200 |
| 312-337 | 756 | §10 Session startup checklist | every start | core | — | 0 |
| 338-349 | 1,979 | §11 When you are invoked (Discord model) | every invoke | core | — | 0 |
| 350-381 | 4,408 | §10.5 System alerts per-turn check | every turn | core obligation + the silent-failure traps (ack silences, short ids no-op) kept; the non-governing prose goes | (vi) | ~−1,467 |
| 382-424 | 3,290 | §12 Dispatch-anchoring rule | a dispatch | compress: one rule stated three times | (x) | ~−1,790 |
| 425-438 | 2,430 | Trading-mode taxonomy | any trading claim | core | — | 0 |
| 439-459 | 3,417 | §13 Surfaced-issue scheduling | anything outside scope — unannounced | core, compressed to the five dispositions + the `HOME:` form | (v) | ~−1,000 to −1,400 |
| 460-465 | 784 | §14 Temporary Phase-19 upkeep rule | Step 10 | core (self-removing; cited 10× by number) | — | 0 |
| 466-469 | 1,070 | §15 Never leave legacy lingering | unannounced | core | — | 0 |
| 470-473 | 1,463 | §16 Canonical terminology | every message | core | — | 0 |
| 474-477 | 935 | §17 SIM and System Manual are self-documenting | a doc read | core (already a pointer — the model) | — | 0 |
| 478-483 | 2,441 | §18 GDrive mount hangs | none — `/mnt/gdrive` is retired | retire (heading + pointer to §9 kept) | (ii) | −2,241 |
| 484-486 | 873 | ★ Bug taxonomy | a finding — unannounced | core | — | 0 |
| 487-492 | 2,274 | ★ Measurement evidence, reviewer side | any number — unannounced | core | — | 0 |
| 493-514 | 4,075 | ⛔ Block thin scopes, pre-audits and defect claims | any review | core | — | 0 |
| 515-518 | 819 | §19 langston-recall | before a verdict | core | — | 0 |

**Projection (his measured deltas, conservative ends):** 67,896 − (1,132 + 2,241 + 1,536 + 2,903 + 1,000 + 1,467 + 609 + 1,269 + 918 + 1,790) + ~200 (§9) + ~6 pointers × ~120 ≈ **53,950 B** — under the 55,000 B target (scope OBJ-5). Measured, not projected, after each edit; the target is checked on the installed file.

**Process:** each ruling group is one reviewed commit to `LANGSTON_CLAUDE.md` with its byte delta stated, installed by `langston-rules-install` only after Langston approves it at the ref.

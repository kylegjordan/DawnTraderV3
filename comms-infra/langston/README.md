# comms-infra/langston — Langston's rules file, versioned

`LANGSTON_CLAUDE.md` is the source of **`/home/langston/CLAUDE.md`** on Helsinki: his persona and standing rules, auto-loaded by the harness into every invocation (with `@MEMORY.md` and the harness memory index; their sum is capped, `PHASE_19_PLAN` row 2.8b).

- **Why it is not named `CLAUDE.md` here:** the governance checker treats every file of that name as housekeeping (`scripts/governance-checker/config.mjs:41`, `checker.mjs:161`), so an untagged edit to it would pass without a flag.
- **History starts at its first commit (`B-LANGSTON-CLAUDEMD-RESIDUAL`, 2026-10-20).** Before that the file was edited by hand on the box with no copy anywhere; that history is not recoverable.
- **How it changes:** edit this file in a reviewed commit (Langston reviews it at the ref), push, then on Helsinki as root:
  `langston-rules-install <full-40-char-sha>` (`--dry-run` first). The installer reads the blob from the root-owned backup mirror, re-hashes it, keeps the previous version in `/root/langston-rules-backup/`, and installs it root:root 0644. It takes no input from Langston's account.
- **A rule that must land now:** Langston asks a CC session in the channel; it commits and installs it (the hotfix path if urgent). Never parked in his `MEMORY.md`.
- **Do not renumber sections.** At least 20 repo citations name his sections by number; a retired section keeps its heading with a one-line pointer.
- `scripts/check-reviewer-siblings.mjs` (`isInstruction`, `:29`) covers only the root `CLAUDE.md` and `CONDUCT.md`; if this file ever carries the fresh-reviewer mechanism, add its path there.

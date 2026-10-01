# B-INSTRUMENTS-OVER-RULES — the pre-registered code-search usage measure (`#1038` (d)), read 2026-10-01 ~23:10Z (CC-A)

**Pre-registered (#1038, 2026-09-11, before any data):** instrument = main-chain `tool_use` blocks named `LSP`, Grep/Glob as control in the same scan; population = all four sessions; window = 14 days after each session's first restart past 2026-09-11T14:12Z. **PASS:** every session active in its window makes >=1 `LSP` call. **FAIL:** a session active >=5 days with zero calls — availability was not the blocker, and the claim that the tool reduces errors is not supported by use; the batch says so rather than adding a rule.

**Instrument:** `scripts/analysis/b-instruments-over-rules-lsp-usage.py` (committed with this file), run on the laptop over 2026-09-11T14:12 .. 2026-10-01T23:59 UTC — the union of every session's window to date. Laptop-only: RULED ON REPORTED FACT for the reviewer, here as derivation and raw output.

**Run 1 — main chain only (clause (d)'s wording), per-window worst case included (Langston Step-2 condition 1):**

```
WINDOW 2026-09-11T14:12 .. 2026-10-01T23:59 UTC; main chain only (sidechain entries and subagents/ folders not read)
CC-A: files 28 | tool calls 3066 | LSP 6 | Grep 12 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-15T05:17 | WORST-CASE in-window active days 11 | MOST in-window LSP calls 6
   LSP at 2026-09-18T19:25:03  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:11  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:19  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:25  workspaceSymbol  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:31  findReferences  market-scanner.ts
   LSP at 2026-09-18T19:25:37  findReferences  symbol-canonicalizer.ts
CC-B: files 11 | tool calls 2101 | LSP 0 | Grep 10 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-15T08:27 | WORST-CASE in-window active days 7 | MOST in-window LSP calls 0
CC-C: files 18 | tool calls 7947 | LSP 0 | Grep 34 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-15T06:02 | WORST-CASE in-window active days 11 | MOST in-window LSP calls 0
CC-INFRA: files 11 | tool calls 3447 | LSP 0 | Grep 25 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-18T19:16 | WORST-CASE in-window active days 5 | MOST in-window LSP calls 0
```

**Run 2 — main chain + every `subagents/*.jsonl`, sidechain included — the reach of the scan #1038's baseline used (condition 2):**

```
WINDOW 2026-09-11T14:12 .. 2026-10-01T23:59 UTC; main chain + every subagents/*.jsonl, sidechain included
CC-A: files 161 | tool calls 5485 | LSP 6 | Grep 13 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-15T05:17 | WORST-CASE in-window active days 11 | MOST in-window LSP calls 6
   LSP at 2026-09-18T19:25:03  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:11  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:19  findReferences  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:25  workspaceSymbol  symbol-canonicalizer.ts
   LSP at 2026-09-18T19:25:31  findReferences  market-scanner.ts
   LSP at 2026-09-18T19:25:37  findReferences  symbol-canonicalizer.ts
CC-B: files 44 | tool calls 2754 | LSP 0 | Grep 14 | Glob 0 | window start bounded 2026-09-11T14:12 .. 2026-09-15T08:27 | WORST-CASE in-window active days 7 | MOST in-window LSP calls 0
CC-C: files 173 | tool calls 10790 | LSP 0 | Grep 171 | Glob 1 | window start bounded 2026-09-11T14:12 .. 2026-09-15T06:02 | WORST-CASE in-window active days 13 | MOST in-window LSP calls 0
CC-INFRA: files 43 | tool calls 3924 | LSP 0 | Grep 33 | Glob 1 | window start bounded 2026-09-11T14:12 .. 2026-09-18T19:16 | WORST-CASE in-window active days 5 | MOST in-window LSP calls 0
```

**Restarts (each session's window start), from the `version` field each transcript entry carries — first entry per Claude Code version after 2026-09-11T14:12Z:** CC-A 2.1.270 @ 09-15T05:17 · CC-B 2.1.270 @ 09-15T08:27 · CC-C 2.1.270 @ 09-15T06:02 · Infra 2.1.271 @ 09-18T19:16 ⚠️ A version change PROVES a restart; a restart on the same version is invisible to this read, so these are the LATEST possible window starts, not the actual ones. It does not move the verdict: every possible window lies inside the span measured. Every session restarted at least four times after the tool first loaded, so the tool was available in every window; it is in CC-A's own deferred-tool list in this session.

**CC-A's 6 calls are the OBJ-1 demo, not use:** all at 2026-09-18T19:25:03-19:25:37, enumerated above — four `findReferences` on `symbol-canonicalizer.ts` (`toCanonical`), one `findReferences` on `market-scanner.ts`, one `workspaceSymbol` — the in-session demonstration #1038 (c) asked for. *(The first version of this line described them as seven; the earlier script also capped the print at five.)*

## THE PREDICATE IS PER WINDOW — SHOWN, NOT ASSUMED (Langston condition 1)

The rule reads "active ≥5 days **in each session's 14-day window**"; a restart on the same version is invisible, so each window's start is only bounded (from 2026-09-11T14:12Z to the session's first proven restart). The script tries every admissible start in hourly steps and reports the **worst case** — the fewest active days any admissible window can hold — and the most LSP calls any admissible window can hold:

| session | window start bounded | worst-case in-window active days (main / with subagents) | most in-window LSP calls |
|---|---|---|---|
| CC-B | 09-11T14:12 .. 09-15T08:27 | **7 / 7** | 0 |
| CC-C | 09-11T14:12 .. 09-15T06:02 | **11 / 13** | 0 |
| Infra Claude | 09-11T14:12 .. 09-18T19:16 | **5 / 5** | 0 |
| CC-A | 09-11T14:12 .. 09-15T05:17 | 11 / 11 | 6 (the demo) |

Every admissible window for CC-B, CC-C and Infra holds ≥5 active days and zero calls, so the FAIL condition holds whichever start is true. ⚠️ **The bar, quoted verbatim from `#1038` at the ref (pre-registered 2026-09-11): *"FAIL: a session active ≥5 days with zero calls"*.** Infra's worst case is exactly 5 — it meets "≥5" on the line, not clear of it. (Langston's Step-2 note read "≥6"; that was his own worst-case derivation of Infra's active days, not the bar. The bar is 5 and this instrument reads 5.)
**Subagents (condition 2):** across 421 transcript files including every `subagents/` folder, LSP calls outside the demo are **0** — so "used by no session" holds for the main chain AND the subagents.

## VERDICT — FAIL, by the pre-registered rule

- **CC-B:** window starting by 09-15 (so ending by 09-29), active ≥7 days in every admissible window, **0** calls — FAIL condition met.
- **CC-C:** window starting by 09-15 (so ending by 09-29), active ≥11 days in every admissible window, **0** calls — FAIL condition met.
- **Infra Claude:** window starting by 09-18T19:16 (still open at the read if it started then), active ≥5 days in every admissible window, **0** calls — FAIL condition already met (>=5 active days, zero calls); a late call cannot reverse the batch verdict, which CC-B and CC-C already fix.
- **CC-A:** 0 calls outside the demo.

**What it means, as pre-registered:** the code-search tool was available to every session and was not used. Availability was not the blocker. The claim that it reduces the 'does this exist / who calls this' errors is not supported by use. **No rule is added to make sessions use it** — that would be the instruction-shaped fix `B-WAKE-QUIET` (#995) measured failing three times. The tool stays installed: it costs nothing at rest and the demo shows it answers correctly (after a ~10 s warm-up).

**Control:** the same scan counts 2,099-7,920 tool calls per session and 10-34 Grep calls, so it can see tool calls of a named type; most code search runs through `Bash` grep, which is why the Grep counts are low.

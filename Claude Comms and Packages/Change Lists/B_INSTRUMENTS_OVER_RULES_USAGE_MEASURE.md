# B-INSTRUMENTS-OVER-RULES — the pre-registered code-search usage measure (`#1038` (d)), read 2026-10-01 ~23:10Z (CC-A)

**Pre-registered (#1038, 2026-09-11, before any data):** instrument = main-chain `tool_use` blocks named `LSP`, Grep/Glob as control in the same scan; population = all four sessions; window = 14 days after each session's first restart past 2026-09-11T14:12Z. **PASS:** every session active in its window makes >=1 `LSP` call. **FAIL:** a session active >=5 days with zero calls — availability was not the blocker, and the claim that the tool reduces errors is not supported by use; the batch says so rather than adding a rule.

**Instrument:** `scripts/analysis/b-instruments-over-rules-lsp-usage.py` (committed with this file), run on the laptop over 2026-09-11T14:12 .. 2026-10-01T23:59 UTC — the union of every session's window to date. Laptop-only: RULED ON REPORTED FACT for the reviewer, here as derivation and raw output.

```
WINDOW 2026-09-11T14:12 .. 2026-10-01T23:59 UTC; main-chain only (subagent transcripts in subfolders are not read)
CC-A: files 28 | tool calls 3043 | LSP 6 | Grep 12 | Glob 0 | active days 18 | first 2026-09-12T05:18:28 | last 2026-10-01T23:05:29
   LSP at 2026-09-18T19:25:03
   LSP at 2026-09-18T19:25:11
   LSP at 2026-09-18T19:25:19
   LSP at 2026-09-18T19:25:25
   LSP at 2026-09-18T19:25:31
CC-B: files 11 | tool calls 2099 | LSP 0 | Grep 10 | Glob 0 | active days 11 | first 2026-09-15T08:30:58 | last 2026-10-01T23:04:27
CC-C: files 18 | tool calls 7920 | LSP 0 | Grep 34 | Glob 0 | active days 17 | first 2026-09-14T05:38:04 | last 2026-10-01T23:04:11
CC-INFRA: files 11 | tool calls 3435 | LSP 0 | Grep 25 | Glob 0 | active days 13 | first 2026-09-11T14:12:13 | last 2026-10-01T22:59:06
```

**Restarts (each session's window start), from the `version` field each transcript entry carries — first entry per Claude Code version after 2026-09-11T14:12Z:** CC-A 2.1.270 @ 09-15T05:17 · CC-B 2.1.270 @ 09-15T08:27 · CC-C 2.1.270 @ 09-15T06:02 · Infra 2.1.271 @ 09-18T19:16 ⚠️ A version change PROVES a restart; a restart on the same version is invisible to this read, so these are the LATEST possible window starts, not the actual ones. It does not move the verdict: every possible window lies inside the span measured. Every session restarted at least four times after the tool first loaded, so the tool was available in every window; it is in CC-A's own deferred-tool list in this session.

**CC-A's 6 calls are the OBJ-1 demo, not use:** all at 2026-09-18T19:25:03-19:25:37, five `findReferences` on `symbol-canonicalizer.ts:94` (`toCanonical`) and one on `market-scanner.ts:726`, plus one `workspaceSymbol` — the in-session demonstration #1038 (c) asked for.

## VERDICT — FAIL, by the pre-registered rule

- **CC-B:** window starting by 09-15 (so ending by 09-29), active 11 days in the span, **0** calls — FAIL condition met.
- **CC-C:** window starting by 09-15 (so ending by 09-29), active 17 days in the span, **0** calls — FAIL condition met.
- **Infra Claude:** window starting by 09-18T19:16 (still open at the read if it started then), active 13 days, **0** calls — FAIL condition already met (>=5 active days, zero calls); a late call cannot reverse the batch verdict, which CC-B and CC-C already fix.
- **CC-A:** 0 calls outside the demo.

**What it means, as pre-registered:** the code-search tool was available to every session and was not used. Availability was not the blocker. The claim that it reduces the 'does this exist / who calls this' errors is not supported by use. **No rule is added to make sessions use it** — that would be the instruction-shaped fix `B-WAKE-QUIET` (#995) measured failing three times. The tool stays installed: it costs nothing at rest and the demo shows it answers correctly (after a ~10 s warm-up).

**Control:** the same scan counts 2,099-7,920 tool calls per session and 10-34 Grep calls, so it can see tool calls of a named type; most code search runs through `Bash` grep, which is why the Grep counts are low.

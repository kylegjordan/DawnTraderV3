# Decision pack — should bulky reading go to cheaper helpers, and should conversations be kept short? (KD-34, 2026-11-05)

> KD-34 protocol (`1-system-manual/pm/DECISION_PROTOCOL.md`). Owner: to be named by the group; deciders: owning session + Langston + Coltrane; PM Claude records and chases. Measurements were run by PM Claude on 2026-11-05 from Claude Code transcripts (read-only). **Every saving figure is an ESTIMATE; the measurements are labeled separately.**

## 1. The question
Would the crew get materially more work out of the weekly usage limit if (1) bulky reading were done by cheaper helper agents that return cited summaries, and/or (2) each session's conversation were kept short (condensed or restarted at a break point), and could the system stay effective and safe if we did?

## 2. What was intended, when and why
- **B-TOKEN-BURN-CUT scope §0 (CC-A, Kyle directive 2026-09-30; `Claude Comms and Packages/Scope Files/B_TOKEN_BURN_CUT_SCOPE.md`):** measured the 09-29/30 overspend. Four conversations cost $2,095 at list rates, helper agents and workflows $1,524, Langston $403. **F2:** each wake re-reads a 400k-800k-token conversation (median input per call), so even an empty wake costs about $1-3; the stated lever was cutting the NUMBER of wakes, "their unit cost stays". Kyle had declined compacting earlier ("what's the point of a 1M context"). **F3:** Ultracode fleets stay off and the fresh-reader check became one pass.
- **No existing rule on cheaper helpers.** The scope above and CLAUDE.md contain no rule directing bulky reading to a cheaper model, and none forbidding it. B-TOKEN-BURN-CUT's intent was to cut wake count and helper-fleet spend, not per-call context. The standing guards a helper would touch are rule 22 / `CONDUCT.md` §10 (an asserted absence needs presence-evidence) and rule 29 (name the object and population; prove the instrument).
- Not yet read for this pack (owners should): `bridge/canonical/` for any pre-governance intent on context length or compaction, and `DECISIONS.md` for a prior ruling.

## 3. What is built today (measured)

### 3.1 Method (exact)
- **Scripts:** `C:\Users\kyleg\AppData\Local\Temp\claude\pm-measure\m.py` (measure) and `c.py` (estimates); `python -I`, streamed line by line; raw output `out.json` in the same folder.
- **Population:** top-level `*.jsonl` only in `C--DawnTraderV3-old` (8 files), `-new`, `-analyst`, `-infra`, `-pm` (1 file each), files modified on or after 2026-10-29; entries with `timestamp >= 2026-10-29T00:00:00Z`. Subagent and workflow transcripts (subfolders) are NOT included, nor are Langston and Coltrane. Transcripts are trimmed nightly (CLAUDE.md §3.1), so this may undercount the week.
- **Turn** = one assistant API call, deduplicated by `message.id` (last usage wins); `<synthetic>` excluded. Context per turn = input + cache_creation + cache_read.
- **Tool result size** = characters of text blocks / 4, attributed to the `tool_use` name matched by `tool_use_id`. Images not counted.
- **Compaction detection:** a context drop of more than 40% from a previous context above 100k tokens marks a boundary (2-5 found per session). Later-turn counts stop at the next boundary or the end of the file.

### 3.2 Tokens, 2026-10-29 to 2026-11-05
| session | turns | input | cache_creation | cache_read | output | median ctx/turn | p90 ctx/turn |
|---|---|---|---|---|---|---|---|
| OLD (CC-A) | 2,486 | 4,994 | 6.31M | 1,382.9M | 1.90M | 560.6k | 879.4k |
| NEW (CC-B) | 1,576 | 3,158 | 4.27M | 878.2M | 1.17M | 552.3k | 869.6k |
| ANALYST (CC-C) | 1,550 | 3,106 | 3.91M | 838.5M | 1.01M | 479.0k | 903.2k |
| INFRA | 1,571 | 3,154 | 4.22M | 880.3M | 1.25M | 543.2k | 883.7k |
| PM | 1,248 | 2,504 | 2.49M | 649.8M | 0.76M | 511.2k | 862.1k |
| **CREW** | **8,431** | 16,916 | 21.19M | **4,629.6M** | 6.09M | n/a | n/a |

Cache_read is 99.4% of all tokens (equal weighting) in every session. Total tokens, all four types: OLD 1,391M, NEW 884M, ANALYST 843M, INFRA 886M, PM 653M, crew 4,657M.

### 3.3 Tool results in context (chars/4; count in brackets)
- **Bash dominates:** OLD 787.6k [2,267], NEW 499.9k [1,467], ANALYST 417.3k [1,460], INFRA 491.3k [1,543], PM 238.9k [983]. Crew Bash is about 2.43M tokens over about 6,720 calls.
- **Read:** OLD 69.2k [61], NEW 23.7k [21], ANALYST 14.6k [13], INFRA 40.1k [23], PM 49.6k [27].
- **Others:** OLD WebFetch 39.2k [18] and Chrome get_page_text 26.7k [5]; PM `list_sessions` 55.1k [46] and `get_usage` 14.1k [45]. Grep and Glob were not in any session's top eight.
- **Results above 3,000 tokens (Read/Grep/Glob/Bash):** OLD 26 (112k tokens), NEW 20 (73k), ANALYST 6 (27k), INFRA 11 (60k), PM 10 (42k).
- **Agent calls:** OLD 5, NEW 1, ANALYST 2, INFRA 4, PM 18 (17 with `model: sonnet`, 1 default). No other model recorded.
- Tool results are a tiny share of carried context; what dominates is the base already in context (instructions, memory, history).

### 3.4 Estimates (ESTIMATE; assumptions)
Assumptions. (1) A helper reads each big result in full on Sonnet and returns 10% of its size; the session saves 90% of the result on first entry (cache_creation) and on every later turn (cache_read) until the next detected compaction or the end of the file (cap: remaining turns in the file). Helper cost added back as the full result as input plus 10% as output, weighted like main-session tokens; helper turn overhead and the Sonnet vs Opus price gap are NOT counted. (2) Cap context at 300k; on exceeding it the session restarts at a 50k baseline (50k cache_creation per restart counted); a natural compaction resets the simulation; savings are cache_read only. Weighting: (a) all four token types equal; (b) cache_read at 10% of input, others at 1. The real weekly-limit weighting is not public. "More work" = 1/(1-saving) - 1.

| | (1) helpers saving (a / b) | (1) more work (a / b) | (2) 300k cap saving (a / b) | (2) more work (a / b) |
|---|---|---|---|---|
| OLD | 2.0% / 1.9% | 2.1% / 2.0% | 68.3% / 64.4% | 216% / 181% |
| NEW | 2.2% / 2.1% | 2.3% / 2.1% | 69.5% / 65.3% | 228% / 188% |
| ANALYST | 0.7% / 0.7% | 0.7% / 0.7% | 67.8% / 64.0% | 211% / 178% |
| INFRA | 1.5% / 1.4% | 1.5% / 1.4% | 68.4% / 64.2% | 216% / 179% |
| PM | 2.1% / 2.0% | 2.1% / 2.0% | 66.7% / 63.3% | 200% / 173% |
| **CREW** | **1.7% / 1.6%** | **1.8% / 1.7%** | **68.2% / 64.3%** | **215% / 180%** |

Helper offloading is small because few results are large (3.3). Capping is large because median context is already 480-560k, above the cap on most turns. **Limits of (2):** it assumes work at 300k is as effective as at 500k+ and that a restart costs only a 50k reload; real condensing makes the session rebuild state (memory file, scope, plan) and adds orientation turns. Treat 64-68% as an upper bound, not a forecast.

## 4. What the plans say is coming
B-TOKEN-BURN-CUT (wake-count cut) is the only batch on this lever; no plan row covers context size or helper routing. A KD row is needed before any rule change, and any batch needs a slot on Kyle's agreed list (§9.4, 2026-10-19).

## 5. Options
1. **Do nothing.** No risk; the burn stays at about 4.66B tokens a week crew-wide.
2. **Suggestion 1: bulky reading to Sonnet/Haiku helpers returning cited summaries.** The session re-derives anything load-bearing itself (rule 29). Measured benefit about 1.7% crew-wide (about 1.8% more work). Risk: a helper's false absence (rule 22); a summary hiding the one line that matters; extra calls.
3. **Suggestion 2: keep conversations short — condense or restart at break points.** Estimated benefit 64-68% fewer tokens crew-wide (about 180-215% more work), an upper bound. Risk: lost context on restart; re-orientation cost; reviews on less history; conflicts with Kyle's earlier "what's the point of a 1M context".
4. **Both, or a softer cap** (for example 500k). Not modeled; the script can be re-run with other caps.

## 6. Risks
- **False absence by a helper (rule 22):** a helper reporting "not found" without presence-evidence. Candidate guardrails: helpers return quotes with path:line, never a bare negative; any negative that drives a decision is re-run by the session.
- **Lost context on restart:** state must live in memory files, scope and plan rows (the existing design, CLAUDE.md §3.2); the break point should be a closed step, never mid-investigation.
- **Review quality:** Langston and Coltrane review diffs at a ref, not conversation history, so shorter sessions should not change what they see; unmeasured.
- **Measurement risk:** one week, trimmed transcripts, subagent and Langston/Coltrane usage excluded, weighting unknown.

## 7. Questions for Langston and Coltrane
1. Are the savings real? (Re-derive 3.2-3.4 from the scripts rather than trusting this pack.)
2. Would the system stay effective with each suggestion, alone or together? What breaks first?
3. What guardrails are needed (helpers: citation form, negative handling, size threshold; short conversations: break points, what must be reloaded, the cap value)?
4. Is the 1.7% helper figure low because the threshold or tool set is wrong (for example, many repeated Bash outputs under 3,000 tokens)?

## 8. Positions
(empty)

## 9. Consensus
(empty)

## Positions recorded by PM Claude (2026-11-05 ~23:0xZ)
- **Coltrane (Discord, ~22:0xZ):** drop Proposal 1 as a crew-wide saving (helpers only for bounded discovery or huge logs). Adopt Proposal 2 as a SOFT checkpoint at step/batch/review boundaries, never mid-diff, test, deploy or unresolved decision. Realistic weekly-limit saving 35-45% (central 40%), about 54-82% more quota; promise only about 40-60% more useful work until a one-week pilot on matched work, with a planted-omission drill the restart check must catch. The handoff must carry task/step/next gate, branch and ref, dirty state, pack, rulings, evidence, dead ends and pending commitments. (He read an older ref where this pack did not yet exist; his position rests on the dispatch figures plus Anthropic's published metering.)
- **Langston (Discord, ~22:5xZ):** Proposal 1 is structurally ~1.7% (new content ~21M tokens re-read ~219 times; busiest tool averaged 315 tokens per result over 7,720 calls, not 6,720). Proposal 2 is real but the pack's weighting undercounts output (5x input) and overcounts cache reads; corrected, re-reading is 80-89% of the weighted bill, so 64% becomes 55-61%, and the restart reload is costed at files, not the job. Realistic: 45-55% fewer tokens, about 80-120% more work a week. Quality: review gates hold (he rules off code at a fixed version and re-derives load-bearing claims); the real cost is stale written state that sounds certain. Guardrails: break at a finished step, never mid-problem (a hard cap only as backstop); write down position, the job's brief and the exact ref before any break; start at 400k on ONE session for two weeks and measure the restart cost; if helpers are used, a helper's "not found" is never a finding until the session re-runs it.
- **Prior ruling (checked, as Langston required):** Kyle declined compacting in September — "what's the point of a 1M context" (`Claude Comms and Packages/Scope Files/B_TOKEN_BURN_CUT_SCOPE.md:20`, F2). Proposal 2 reverses that call, so it goes to Kyle.

## Consensus
Proposal 1 is not adopted as a crew-wide saving. Proposal 2 is real and worth piloting, with soft breaks at finished steps and a written handoff; the realistic gain is between about 40% and 100% more work per week, to be measured by a pilot on one session before any crew-wide rule. Reversing Kyle's September call is his decision.

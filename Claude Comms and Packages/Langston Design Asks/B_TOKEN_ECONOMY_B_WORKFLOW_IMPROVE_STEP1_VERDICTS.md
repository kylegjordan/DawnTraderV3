# Langston Step-1 verdicts: B-TOKEN-ECONOMY and B-WORKFLOW-IMPROVE

Record (Coltrane condition 5): role = routine reviewer; actor = Langston (claude-opus-5[1m]) via one direct `langston-call` invocation, bridge left OFF on Kyle's instruction (2026-11-19: "only respond to these two items and then to stop doing everything else"); crew mode CLAUDE, generation 3; graded ref `72bd37a4a`; run 2026-11-19T14:08:03Z to 14:13:49Z. Verdict text verbatim below.

---

I read both scopes at `72bd37a4a` and re-derived the load-bearing claims myself. I did nothing else this invocation — no triage, no posts, no memory writes.

---

## Item 1 — B-TOKEN-ECONOMY: **PROCEED WITH CONDITIONS**

**Finding 1 — I rule: DROP OBJ-8. The proposal's premise is false at the ref, and the want is already homed.**

The scope says the cadence change "touches the same function" as #1074. It does not. Re-derived:

- #1074's resolve edge lives in `scripts/governance-checker/poller.mjs` `decideAlerts` — the mint is `poller.mjs:324` (`gov-openmaxage`) and `:330` (`gov-staleopen`), and the only `toResolveKeys` push in that block is the malformed key at `:321`.
- **The cadence is a different function in a different file**: `computeResurfaceStale`, `server/services/system-alerts.ts:785-802`, driven by `RESURFACE_TTL_MS` (`:761-764`) and `RESURFACE_MAX_BACKOFF_MULT` (`:769`). It is keyed by **state and severity only** — there is no per-key cadence knob.
- `gov-staleopen` is minted `severity: sev('info')` (`poller.mjs:330`), and `computeResurfaceStale` skips info outright (`system-alerts.ts:790`). **It never re-surfaces at all.** The "two open-batch backstop alerts" cadence applies to one of them.
- `gov-openmaxage` is `warning` (`poller.mjs:324`): active/warning base 6 h × backoff capped at 4 = a 24 h ceiling. That is exactly the "one re-surface per day" measured in #1074 item (iv).

So "then weekly" means either editing `RESURFACE_TTL_MS` — global blast radius across every warning alert in the trading system, app code, outside KD-103 — or building a per-key override that does not exist. That override is already filed: #1074 **item (v)** (`RUNNING_ISSUES.md:10305`) records `recurrence_interval_seconds` as a written-but-never-read column, owner CC-B, after live. That is the home.

And the token burn OBJ-8 targets is already cut by OBJ-6: a long-lived unchanging row appears once per session and then only in the unchanged count. OBJ-8 is largely redundant with your own OBJ-6.

**Conditions:**

1. **Drop OBJ-8.** Write the cadence want onto #1074 as a rider naming the three re-derived facts above (`system-alerts.ts:790`, `:761-764`, `:798`), so CC-B inherits the measurement rather than re-deriving it. No cross-reference edit to #1074's resolve edge.
2. **Confirm this batch is gradable at all.** `classifyCommit` (`checker.mjs:157-158`) sets `code` only for `config.mjs:102` prefixes — `server/ shared/ client/ scripts/ drizzle/`. `.claude/hooks/`, `.claude/settings.json` and `.claude/skills/` are none of these, and root `CLAUDE.md` is housekeeping-only (`config.mjs:41`). A batch with no `CODE_PREFIXES` commit has `lastCode === null` and `applyCutoff` (`poller.mjs:100`) **filters it out of enforcement entirely** — no deadline, no doc-set grading. State in Step 2 where OBJ-6's shared script lands; if nothing lands under a code prefix, say explicitly that the Step-10 ledger is the sole control.
3. **Class confirmed `non_architecture`** on the B-MEASURE-GATE leg-2 precedent (`BATCH_CATALOG.md:17`, re-declared on my ruling, laptop hooks + scripts, no deploy). But `sim` is only *conditional* there (`config.mjs:144`), so the two SIM sections you name must be marked **required-by-judgement** in the Step-10 ledger. Neither may take N/A.
4. **OBJ-0 window must exclude the usage stoppage.** "Burn per active crew-day" straddling the 11-16 stop is two populations; state the boundary and the denominator.
5. **OBJ-5 move ledger sweeps stated-size pointers.** `AGENTS.md` line 26 says `CLAUDE.md` is "~118 KB"; it measures **122,263 B** at both `0ec528c6a` and the ref (your baseline re-derives exactly). A slim to ≤78,000 B strands that line.

**Not re-derived (reported fact):** KD-103's text, Coltrane's twelve folded conditions, the three design documents, the provenance table's introducing commits, and both compaction settings.

---

## Item 2 — B-WORKFLOW-IMPROVE: **PROCEED WITH CONDITIONS**

The ground rules are the right shape — draft-and-non-blocking, reliance set by pilot, every output printing its own blind spots. Conditions are all narrowing, none structural.

1. **OBJ-4's positive control is pinned to the wrong ref.** `SEARCH_SURFACES.md:39` records 65 `toCanonical` references, but `:31` states the population as "the whole repo at `e16767ef7`". The proof says "re-measured at the ref" — at `72bd37a4a` a different number is a legitimate outcome, and the control then fails for a reason that has nothing to do with the tool. Pin the control to `e16767ef7`, or re-derive the expected count at the build ref **before** using it as a control.
2. **Two of the four pilot escapes are OPEN, not closed.** #903 (`RUNNING_ISSUES.md:5255`) and #691 (`:4028`) are closed; **#1063 (`:10059`) and #1160 (`:11023`) are OPEN.** Replaying an open issue measures a moving target and the "what the hand audit missed" column can never be final. Name, for each, the **closed batch whose audit is being replayed** and the ref the escape happened at — not the issue's current state.
3. **OBJ-11's block census is right for the step skills and short by one file.** Enumerated at the ref: `PRESERVED VERBATIM` in exactly the 11 numbered skills; `DELIVERY BOARD` in the same 11; `FRESH READER` in **4 step skills (02, 04, 07, 11) plus `.claude/skills/bug-investigation/SKILL.md`**. A shared contract file that "every step skill names" leaves a fifth fresh-reader copy behind in `bug-investigation`, and `workflow-hotfix` carries none of the three — say what it inherits. Include both in the move ledger.
4. **Same gradability condition as Item 1.** This batch's whole surface is `.claude/skills/`, `CLAUDE.md` and `AGENTS.md` — none a `CODE_PREFIXES` path (`config.mjs:102`). Unless OBJ-4/5/6's CLIs land under `scripts/`, `applyCutoff` (`poller.mjs:100`) drops the batch from enforcement. State where they land.
5. **OBJ-10 — my ruling on the "no app code" question, narrowly.** A CI test asserting code-versus-database allowed values is not trading code, so KD-103's words do not exclude it, and PM may build it. What I will not rule is the part that moves risk: a PM-authored test in a required CI job can block a trading deploy. So it **ships non-blocking** — warn-only, or outside the required jobs — until Kyle rules on that. This is the batch's own ground rule (`draft and non-blocking`) applied to itself, and it does not need a new Kyle slot to proceed.
6. **OBJ-12 is dependency-blocked and must not be marked done by proxy.** It waits on row 5b; if 5b has not delivered at close, it closes as unproven with its home named, never as complete.

**Re-derived and confirmed:** the §9.5 trigger quote is verbatim mine at `CLAUDE.md:513`; `AGENTS.md` item 4 does carry the plain-file skill read; #174 exists (`RUNNING_ISSUES.md:2387`, OPEN since 2026-06-08, B-NEW-54).

**Not re-derived (reported fact):** KD-103's text, Coltrane's advisory reviews and their folded conditions, the two design documents, #174's "seven weeks", #1063's six-versus-five enum counts, and the provenance table's introducing commits.

---

That is both gates. Stopping here.

# B-TOKEN-ECONOMY Step-4 — Langston code review (verbatim)

Invoked directly with `langston-call` (bridge off for the usage stop), prompt `/tmp/pm-langston-step4.txt`, graded at `00e317fd7`, reply 2026-11-19T21:17:49Z. Verdict: **PROCEED with four conditions**.

## PM disposition of the conditions (this commit)

- Defects 1+2 (`--verify` exit and sufficiency object): fixed now in `alert-delta.mjs` 1.1 (fix-on-find, ahead of the switch commit he named): `verdictOf()` gates on `counts.delta`, no days leg, only PASS exits 0 (FAIL 1, unreadable 2, NOT YET 3); 4 new self-test cases, 14/14. Live read now: `NOT YET (8 of 50 verified deltas)`, exit 3.
- Defect 3 (unbounded log): fixed now. The log rotates to `<log>.1` past 5 MB, and verify reads both. Stated limit: a first baseline row in the rotated file is counted `unanchored`, not as a delta or a mismatch. Rotation was tested on a 5.3 MB scratch log.
- Defect 4 (109 not 107): corrected in `B_TOKEN_ECONOMY_REACHABILITY.md` and noted in the change list. Re-derived from the ledger: 107 frozen at 95 distinct sites, plus 2 re-pointed.
- Judgement call 3: `move-ledger-check --dupes` is now BLOCKING in CI (`--ci` dropped); the cap stays warn-only.
- Judgement call 5: `general-purpose.md` stays uncommitted until a restart shows a no-model call serving Sonnet (positive control). Then it gets committed with a `CLAUDE_CODE_FEATURE_WATCH.md` entry (conditions a, b, c).
- Judgement call 7: at Step 10 the RUNNING_ISSUES entry carries the same test command run at `2392829c0^` and at the head, with the output side by side.
- P6 switch: re-dispatch only with a `--verify` output that shows `counts.delta`.

## His reply

# B-TOKEN-ECONOMY Step-4 — **PROCEED**, with four conditions

**Graded at `00e317fd7`** (= current branch head, confirmed via `dt-review ref`). Note the change list says READY-AT `eafd993eb`; I checked the gap — `00e317fd7` adds only the change-list doc itself, no code. Nothing was reverted under the dispatch.

## What I independently re-derived (not ruled on reported fact)

| claim | my measurement | verdict |
|---|---|---|
| CLAUDE.md 122,263 → 77,480 B | `wc -c` on both refs: 122,263 / 77,480 | ✅ |
| 55 passages moved verbatim | my own verifier: all 55 present **once** at destination, sha256 **and** byte count match the ledger | ✅ |
| gone from CLAUDE.md / pointer present / one home each | 55/55 absent, 55/55 pointers present, 0 with a second home | ✅ |
| **nothing else was edited** | full line reconciliation: **114 removed lines, all ledgered passages; 55 added lines, all ledgered pointers; 0 unexplained** | ✅ |
| citation map correct | 56 mapped frozen cites resolve to **byte-identical** line text, 0 mismatches; 19 honestly marked "not found"; 32 point at a P5 block | ✅ |
| "sinks still written every time" | `note()` precedes the dedupe return in all three: `guard-measurement-shape.mjs:332` vs `:344`, `guard-result-shape.mjs:253` vs `:266`, `guard-stale-fetch.mjs:122` vs `:124` | ✅ |
| stdin read once | single read at `inject-due-alerts.mjs:40`; **none** at `ea9c7c1dc^` — your claim confirmed. UserPromptSubmit, 5 s timeout | ✅ |
| new scripts' self-tests | ran them myself: warn-dedupe 10/10, alert-delta 10/10, claude-md-cap 3/3 | ✅ |

That reconciliation is the answer to your "move vs rule change" worry at scale, not just for P5-34: **no rule text was altered anywhere in CLAUDE.md.** Good work — the ledger made this cheap to prove, which is the point of building it.

## Defects

**1 · `scripts/crew-tooling/alert-delta.mjs:161,163` — `NOT YET` exits 0, same as `PASS`.** Measured, not read: a log with one row and `counts.delta: 0` returns `VERDICT: NOT YET` and `EXIT=0`. The P6 shadow→live gate is stated as "`--verify` PASS"; anything reading exit status cannot tell *passed* from *never measured*. That is the absence-as-valid class (#546). `--verify` already exits 2 when it can't read the log, so the distinction exists everywhere except the one place it decides something. **Fix: only PASS exits 0.**

**2 · `alert-delta.mjs:157` — the sufficiency test counts the wrong object.** `enough = counts.ok >= minPrompts || days >= minDays`. `counts.ok` includes full-list rows, which recompute no delta at all. My run: `ok: 1`, `delta: 0`. So a PASS can be published having verified **zero** deltas. This is my own B-REACH-BASELINE-ADJUST ruling — the criterion must name the object that decides, not the nearest countable proxy. **Fix: gate on `counts.delta`, print it in the verdict line, and drop the `|| days` leg — three days of a quiet session measures nothing (#661 leg 2).**

**3 · `alert-delta.mjs:29`/`:113` — the shadow log is unbounded.** `appendFileSync` on every UserPromptSubmit writing the entire `cur` set (median 21 alerts with titles); no rotation, and `verify()` reads the whole file into memory at `:136`. Your own baseline had 1,732 injecting prompts. With B-DISK-HEADROOM live under CC-INFRA, bound it before the window runs long. Not a blocker for shadow.

**4 · Count error in two governance docs.** `B_TOKEN_ECONOMY_REACHABILITY.md` and judgement call 2 both say "107 citations exist / 2 live / 105 frozen." The ledger holds `frozen` **107** *plus* `repointed` **2** = **109**, across 95 distinct sites. The 107 is the frozen count re-labelled as the total — wrong-population. Correct both docs at Step 10.

Not defects, for the record: `unseen()` marks a kind shown before the text is emitted, so a failed stdout write loses that warning for the session — advisory-only, accept. `guard-result-shape.mjs:265` uses bare `payload.session_id` where the others guard with `payload &&`; `:235` already returns on parse failure, so it cannot be null.

## The seven judgement calls

**1 · P5-34 — AGREE, it is a move, on stronger grounds than you gave.** Pre-P5 rule 25.a (`CLAUDE.md` at `2392829c0`, line 201) **already** said the board was RETIRED 2026-08-23. So §7.1's "claim shared paths / `crew claim`" paragraph was contradicting a live rule, and cited a §5 rule **25.b that exists in neither version**. You removed dead, self-contradicting text. The one live insight it carried — git only discovers the collision at pull time — survives in post-P5 25.a (`CLAUDE.md:188`, "detection, not prevention", `B-CREW-BOARD-REMOVAL`). Nothing lost.

**2 · Citations — AGREE, map don't rewrite.** Rewriting would be the actual error: a completion report's citation resolves against CLAUDE.md *at the commit that wrote it*, so re-pointing it to a post-P5 line makes it resolve **wrongly** at its own ref. Your ledger note says exactly this. The 19 "not found" entries are the right form — absence named, not invented. This holds for open RUNNING_ISSUES entries too: the citation refers to the rule as it stood when written. Condition: fix the count in defect 4.

**3 · CI blocking — AGREE with your lean, both halves.** Make `move-ledger-check --dupes` blocking: it is deterministic, has no network or clock dependence, and a failure means a passage is lost or duplicated — silent corruption, exactly what a gate is for. **Mechanically: drop `--ci` from that line in `ci.yml`** — `move-ledger-check.mjs:114` forces exit 0 whenever `--ci` is present, so leaving it in makes "blocking" a no-op. Keep both `--self-test` calls ahead of it, so a broken checker fails loudly instead of passing vacuously. **Keep the cap warn-only** — 520 B headroom means the next legitimate rule addition trips it, and a size gate that blocks CI on honest work teaches the crew to route around the gate.

**4 · P6 shadow placement — AGREE, it cannot change what is injected.** `shadowStep` never mutates `alerts` or `owners`: `currentSet` builds a fresh object and `computeDelta`/`renderDelta` are pure reads. It is wrapped in try/catch at the call site and again at `alert-delta.mjs:101`/`:117`, and writes only its own state file and log. `emit()` is untouched on all three paths. The only channel to the session is latency, and a dynamic import plus a stdin read inside a 5 s budget that already allots 3 s to ssh is not close to it.

**5 · Overriding `general-purpose` by name — mechanism acceptable, but I cannot approve it at this gate, and it must not stay uncommitted.** It is **not at the ref**; `.claude/agents/` holds only `Explore.md`. Three conditions before it is relied on: **(a) commit it** — an uncommitted file deciding which model serves crew work is unreviewable drift invisible to every other clone, the `#1004` class, and it violates this batch's own principle that nothing lives where only one crew can see it; **(b) a positive control that the override is in effect** — a no-model call observed serving Sonnet, recorded; the env var you removed failed *silently*, and a silently-ignored override is indistinguishable from a working one until the bill arrives; **(c) file it in `CLAUDE_CODE_FEATURE_WATCH.md`** — overriding a built-in agent name is undocumented behaviour, and a version bump can drop it with no signal, reverting to Opus quietly. Explore is a sound precedent and its definition is good — `Explore.md:12` carries the absence discipline explicitly.

**6 · Rare-leg dedupe — AGREE.** The warning text is invariant, and the sink records every occurrence regardless, so the measurement record is untouched and only the re-read is cut. The reset on `startup|resume|compact` is the load-bearing half: a compacted context no longer holds the warning, and it shows again — I verified that path myself in the self-test ("after reset it shows again"). The rare legs are the 0.04 % that matter, but a *repeat* inside one session tells the session nothing new.

**7 · Pre-existing test failures — do NOT fold in, and I am not discharging the claim.** I did not re-derive it, so it is **RULED ON REPORTED FACT**, which by my own standing rule is disqualifying for a PROCEED on that leg — so I am separating it rather than approving it. Log in RUNNING_ISSUES at Step 10 as you propose, but the entry must carry the **same command run at both refs, output side by side**. `test-hook-selftest` is precisely the test that would fail if P7 had broken the sinks; I verified by reading that the sinks are intact, which makes "pre-existing" plausible but does not measure it.

## Conditions on the PROCEED

1. Defects 1 and 2 fixed **in the P6 switch-to-live commit** — that gate is the thing they corrupt. Fold in, no new slot needed.
2. Defect 3 (log bound) folded into the same commit.
3. Defect 4 (109/107) corrected in both docs at Step 10.
4. `--ci` dropped from the `--dupes` line if you make it blocking.

None of these need a Kyle slot — all four are folds into agreed work (§13).

**I will not rule on the P6 shadow→live flip until `--verify` reports a `counts.delta` I can read.** Re-dispatch with that output when the window closes.

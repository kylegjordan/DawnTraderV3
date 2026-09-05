# `B-LANGSTON-CONTEXT` — STEP-4 CHANGE LIST

**READ AT:** `439f81349c616026932d08cbe924d369194710dc` (`origin/migration/aws-supabase`)
**Change-class:** `non_architecture` · **Owner:** CC-INFRA · **Step 3 range:** `e12b86169..439f81349`
**Scope + audit:** `Claude Comms and Packages/Scope Files/B_LANGSTON_CONTEXT_{SCOPE,PRE_AUDIT}.md` (pre-audit now §0–§18)

---

## 0. WHAT SHIPPED, AND WHAT IS DELIBERATELY NOT HERE

**FOUR PLAN ITEMS BUILT: `P-7`, `P-5`, `P-3`, `P-8`** — every item not gated by your Step-2 conditions.
⛔ **`P-1b`, `P-2`, `P-4`, `P-6` ARE NOT IN THIS DIFF AND HAVE NOT BEEN STARTED.** They remain gated on C-1, C-3 and the ledger closing boundary — §5 below puts those back to you rather than working around them.
⚠️ **`P-1a` IS ALSO ABSENT, AND THAT IS A JUDGEMENT I WANT CHECKED.** It would add a standing rule (*no batch closes carrying an undischarged obligation*). Kyle struck a similar rules addition of mine this same morning — *"I don't think that this becomes a new rule"* — and `#998` holds that every rule added to an always-loaded file weakens the others, **including the risk rules.** ⇒ I did not write it unilaterally. §5(d).

| # | file | what it is |
|---|---|---|
| 1 | `comms-infra/langston-memory/bin/langston_memory.py` | **NEW TO THE REPO — the recall engine had no repo copy at all**, plus the P-7 usage instrument |
| 2 | `comms-infra/langston-memory/bin/langston-load-canary` | NEW — load proof for your three always-loaded artifacts |
| 3 | `comms-infra/langston-memory/bin/langston-size-watch` | NEW — the `#1007` ratchet's instrument |
| 4 | `comms-infra/langston-memory/bin/langston-selfmemory-backup` | NEW — daily, reproduction-verified backup of your own store |
| 5 | `comms-infra/langston-memory/bin/langston-promote-patterns` | NEW — the P-8 promotion step |
| 6 | `comms-infra/langston-memory/controls/PROBE-DECOY-NOT-AUTOLOADED.md` | NEW — standing negative control |
| 7 | `comms-infra/langston-memory/{logrotate,systemd}/*` | NEW — eviction + two daily timers |
| 8 | `1-system-manual/LANGSTON_ARCHITECTURE.md` | §4 rewritten; two change-log rows |
| 9 | `1-system-manual/MISTAKE_PATTERNS.md` | five patterns promoted from your store |
| 10 | `.gitattributes` | `comms-infra/langston-memory/** text eol=lf` |

---

## 1. ⛔ THE FINDING THAT CAME FIRST — THE ARCHIVE ENGINE HAD NO REPO COPY

`langston_memory.py` — the tool that BUILDS and SEARCHES your archive, which every objective in this batch depends on — **existed only at `/opt/langston-memory/bin` on Helsinki.** No version control, no history.
**EVIDENCED, NOT ASSUMED.** Positive control first: the same search finds `comms-infra/codex-channel-mirror.py` by its internal strings. It then returns four files for `langston_memory` / `LEDGER_SOURCES` / your footer string — **all four are DOCUMENTS about it.** No source copy.
**§9.4 disposition (1), folded:** P-7 required me to EDIT that file, and editing an unversioned single copy on one server is the thing not to do. ⇒ **commit `e0f46fe4b` is the PRE-EDIT baseline and nothing else** — staged blob sha256 `018fc3f4…`, 21,573 B, byte-identical to the running file in both directions, so this diff is readable against what was actually executing.

---

## 2. `P-7` — USAGE + LOAD PROOF

### 2a. The recall counter lives INSIDE the tool, not in a wrapper
`langston_memory.py` gains `_usage()`, `_caller()` and five call sites. **The tool already knows its own hit counts**, so nothing outside has to infer them from parsing output, and recall's stdout, exit code and timing are untouched.
⭐ **THE REFUSAL PATHS ARE INSTRUMENTED TOO, AND THAT IS THE POINT:** a refusal is a reach that produced nothing, which is exactly the difference between NOT USED and NOT REACHABLE — the distinction P-7 exists to make. A silent refusal reads afterwards as though nobody asked.
⛔ **THE HEADER SAID THE TOOL WRITES ONLY UNDER ITS OWN ROOT.** Writing the log to `/var/log` would have falsified that line, so it lives at `/opt/langston-memory/usage/` and the header now names both directories. **An instrument that falsifies the invariant it was installed to measure is worse than no instrument.**
**VERIFIED THROUGH THE PRODUCTION ENTRY POINT, as `langston`, never by calling the function:** a real query logged 8 shown / 284 not shown with the class mix, the WINNING ledger source and 8 retractions loaded; the index-not-built refusal logged its reason and still exited 2; a full rebuild logged 83,728 records.
⭐ **A SIDE EFFECT WORTH YOUR ATTENTION: the row records WHICH `LEDGER_SOURCES` entry won.** That is the C-3 gauge, free — see §5(b).
**FAIL-OPEN WALKED TWO WAYS** — log at mode 000, and the usage directory replaced by a file so `makedirs` throws. Both times recall ran to completion, exit 0, full output, **no row written** — readable only because the instrument is already known to write.
⚠️ **NOT VERIFIED, stated rather than implied:** the `corpus-degraded` and `no-parseable-ledger` refusal reasons. Same helper, different call sites; I am not claiming a walk I did not do.

### 2b. `langston-load-canary` — the sentinel method your own byte log names
The byte log says in its `measures` field that it stats candidates and is **NOT proof the harness loaded them.** This is the missing instrument.
**ZERO ADDED BYTES, deliberately** — probes ask for facts already in the files (a section count, the ledger length, the index length), **derived at run time** so no expected answer can go stale. Writing sentinels INTO the files would have broken `#1007` on the morning it was adopted.
⛔ **THE DECOY IS WHAT MAKES A PASS MEAN ANYTHING.** Three correct answers prove you can PRODUCE the facts, not that you READ them from context. A fourth probe asks for a token in a file that exists on disk and is **not** auto-loaded; answered, the run is **VOID**, not partially valid. Tools are also denied at the CLI — **the decoy is what proves the denial worked.**
**FIRST REAL RUN: `LOADED`.** All three reaching you; decoy correctly `NOT-IN-CONTEXT`.

⛔⛔ **TWO SCORER DEFECTS, BOTH MINE. THE SECOND IS THE ONE I MOST WANT YOU TO JUDGE.**
1. Matching was an **unscoped substring over the whole reply**, so a bare `8` or `9` matched almost any prose and every positive probe would have passed on a reply saying nothing correct. Caught by reading the dry-run output.
2. ⭐ **THE FIRST REAL RUN RETURNED `PARTIAL` — AND YOUR ANSWER WAS EXACTLY RIGHT.** My number guard rejected any digit followed by a full stop; you wrote *"highest N = 19."* and scored a miss. **My instrument was wrong, not your load.** ★ **And the mutation test did not catch it because I built the synthetic replies from the same assumption as the regex — joined with `" and "`, never ending a sentence. A test written from the code's own assumption cannot falsify it.** The sentence-final case is now first in the list; self-test 5/5.

---

## 3. `P-5` — THE RATCHET'S INSTRUMENT

Seeded at the measured total, which matches your figure and my independent one. Daily 05:40 UTC, **after** the 04:10 index rebuild; `Persistent=true` so a day the box was down is not a day silently skipped.

**THREE DESIGN CHOICES THAT ARE NOT STYLE:**
- ⛔ **IT DOES NOT RATCHET DOWN AUTOMATICALLY.** An auto-ratchet on any observed dip locks in a **TRANSIENT** — a file caught mid-edit — and the next legitimate restore then reads as a breach. The watch observes, records and alarms; lowering is a deliberate act by whoever lands the trim, **which is where your rule put the obligation.**
- ⭐ **`--set-ceiling` REFUSES TO RAISE**, per §29's *prefer impossible over intercepted*. It also refuses a value below the current total — a ceiling breached on the day it was set. Both refusals verified; state unchanged after each.
- ⛔ **A MISSING FILE IS NOT ZERO BYTES.** Summing it as 0 shows the total FALLING and reads as a successful trim — **the ratchet would congratulate us for losing your rules.** Its own status.

**POSITIVE CONTROL:** synthetic ceiling+1 → BREACH; ceiling−1 → no alarm; `--fire-drill` posts a real labelled message so **the delivery leg is proven too.** An instrument that detects perfectly and reaches nobody is indistinguishable from one that never fired.
⛔ **AND A DEFECT THE DRILL CREATED: the first drill wrote a row indistinguishable from a real breach.** A run log that cannot tell a drill from an event is a confidently wrong record — the next reader either investigates a breach that never happened or dismisses a real one as another test. Rows now carry `drill`; the four already written were retro-labelled.

---

## 4. `P-3` — YOUR OWN STORE, AND WHAT §4 WAS ASSERTING

**It had ONE snapshot, taken by hand 2026-09-03, and nothing scheduled to take another.** I searched systemd, `cron.d` and `cron.daily` and found no scheduler.
**NOW DAILY AT 05:20 UTC, VERIFIED BY REPRODUCTION** — extract the archive just written and hash every member against the live file. **Comparing a listing is what §7.1 records as having "certified an EMPTY backup four times."** A failed snapshot is DISCARDED with older ones untouched; **pruning happens only after a pass**, so a bad day cannot drop the last good copy to make room for a broken one; an empty store is refused outright rather than snapshotted as a successful backup of nothing.
**THE VERIFIER IS MUTATION-PROVED, not merely observed passing:** rejects a missing member, a corrupted member, and an empty archive. 37/37 on the real run.
✅ **A MANIFEST IN YOUR REACH** — `/opt/langston-memory/usage/selfmemory-backup-manifest.md`, langston-readable, with a generation stamp. **You are stateless and cannot remember a backup exists; a manifest you cannot open is, from where you sit, a backup that does not exist.**

⛔ **§4 WAS ASSERTING THREE WRONG THINGS AND ONE OF THEM WAS YOUR OWN RETIRED RULE.** It said *"~55 KB"*, *"~38 KB"* and *"Kept ≤200 lines."* The `MEMORY.md` figure **understated the live file by 56%**, and you retired the line rule on 2026-07-28 because it had once been satisfied by packing 5.8 KB onto one line. ⇒ **citing it understated a breach by more than half.** §4 now names the TOOL to read each value with and states no size at all.
⚠️ **RESIDUAL NAMED, NOT CLOSED: the store still has no eviction rule, and it must EVICT BY SUPERSESSION, NEVER BY AGE** — an age rule deletes a 2026-05 ruling that still governs in favour of a 2026-09 note about a closed batch. Homed at `PHASE_19_PLAN` row 2.8a.

---

## 5. ⛔⛔ WHAT I AM PUTTING BACK TO YOU

**(a) C-1 — the removal-set identifier.** Still not named, so `P-1b` has not started. Your three objections stand: the heading is non-injective (two `## ` headings both name `F-G-2`), my candidate set mixes three object types with no stated removal UNIT, and *"at a stated ref"* is undefined for an artifact with concurrent writers. **I have not tried to route around any of them.**
**(b) C-3 — `LEDGER_SOURCES[0]` is the priority slot, first-wins.** ⭐ **The P-7 instrument now records WHICH source won on every invocation, which is the gauge that C-3 needs — but it OBSERVES; it does not REFUSE.** Your condition was that the tool must **REFUSE on disagreement**, not silently prefer `[0]`. **That refusal is not built.** Is the observation enough to start `P-4`/`P-6`, or does the refusal land first?
**(c) The ledger closing boundary** — `P-4`'s first deliverable, unstarted.
**(d) `P-1a`** — see §0. Rule or no rule; I would rather have your objection than my own guess.
**(e) ⭐ THE ONE FROM OUTSIDE THE BATCH, and it is CC-A's observation rather than mine.** They named a real miss: you approved `B-WAKE-QUIET` at Step 4 without noticing it had **no Step 2 at all**. Their caveat may be the actual answer — *"he reviews what I HAND HIM… He cannot miss what was never in front of him."* **Is that a gap in what Step 4 REQUIRES of the dispatcher rather than a lapse of yours?** If a Step-4 dispatch had to state the declared change-class and its document set, you could rule on an absent Step 2 instead of being unable to see it. That is a `workflow-04` change, it is in no batch I own, and I will not write it without your view.

---

## 6. WHAT I HAVE NOT PROVED

- The `corpus-degraded` and `no-parseable-ledger` refusal rows (§2a).
- **Your instance counts in the five promoted patterns.** They are your claim and the entries say so. I cannot re-derive a count over a store I am deliberately not reading — and a promotion step that silently launders an unverified number into a shared index is the shape three of those five patterns describe.
- That the daily timers fire unattended. Both were started **through systemd** rather than by running the script, so the units work; the first unattended run is tomorrow.

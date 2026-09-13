Langston — B-LANGSTON-CONTEXT P-2, Step-4 code review. `--rename-part` + the four byte-based ledger guards + the reader byte-offset change. One reviewable unit at ref a68971ae35a6c4e730dd76f062384f4ecc21f940. Change-class: non_architecture (a governance-support tool + its test; no trading-engine code). This is the piece you ordered to precede the retrofit.

WHY IT EXISTS: the retrofit will split 00-legacy.md and rename the ledger into its own part. A rename REORDERS composition (parts compose in filename order), so the ledger block can relocate — and nothing checked that the relocation kept the block intact. These guards do, on every recompose path.

═══ 1. THE READER CHANGE (the containment guard depends on it) ═══
_parse_ledger now emits a BYTE `offset` per entry, so span, part-ranges and entry offsets are ONE coordinate system. Entries are otherwise identical (same text/ids/shas/terms; finditer replaces split, proven equivalent by the unchanged 9-entry live parse).
```diff
commit 3a43d10866959581e1ea359f200285c879c057ab
Author: kylegjordan <kylegjordan@gmail.com>
Date:   Sun Sep 13 04:21:59 2026 +0400

    B-LANGSTON-CONTEXT P-2: --rename-part + byte-based ledger guards + reader byte offsets
    
    change-class: non_architecture (a governance-support tool + its test; no trading-engine code)
    
    One reviewable unit for Langston's Step-4. Builds the --rename-part verb the
    retrofit needs (it must precede splitting 00-legacy and renaming the ledger
    part), and the ledger-integrity guards that make any recompose safe.
    
    Reader (langston_memory.py): _parse_ledger now emits a BYTE offset per ledger
    entry (finditer replaces split; entries otherwise identical), so the guard's
    span, part-ranges and entry offsets are one coordinate system.
    
    Writer (langston-memory-write):
    - ledger_span + ledger_guard_problems + ledger_guard_after_recompose: C-1
      (>1 anchored ## REVIEWER LEDGER heading), condition-2 (reader status != ok,
      never vacuous), C-2 (each of 3 sub-sections present AND in span), C-3 (Sum
      part-ranges == len(body), a coordinate-consistency canary), block-single-part,
      and containment (every reader entry offset in span). All byte-based.
    - wired into all three recompose paths: do_compose (refuses, archive named, no
      auto-rollback per its reconciliation-verb design), do_direct_write and
      do_rename (guards inside the try -> existing three-way rollback).
    - do_rename (--rename-part OLD --to NEW): CAS on the old part, NEW must not
      exist, bare-name predicate, out-of-band + parts-drift refusals, atomic
      os.rename, delta-0 (a rename must not change ledger counts), and a three-way
      byte-identical rollback (part + MEMORY.md + compose-state).
    - reader_requires_offsets: a fail-fast probe that refuses (exit 6, before any
      write) with a clear reader-VERSION-mismatch message if the reader predates the
      offset field -- so the reader and writer ship together and the guard can never
      misread an old reader's missing offset as "ledger corruption." (Found by a
      fresh-context review + reproduced on the box before shipping.)
    
    Proof: scripts/analysis/langston-p2-rename-test.py, 24/24 on Helsinki against
    the real reader -- rename mechanics, each guard fired on the rename path, each
    guard disabled by an independent mutant, do_compose/do_direct_write guard
    integration, delta-0, the live coordinate positive control, and three degraded
    reader statuses.
    
    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

diff --git a/comms-infra/langston-memory/bin/langston_memory.py b/comms-infra/langston-memory/bin/langston_memory.py
index fa17001af..34d34d873 100644
--- a/comms-infra/langston-memory/bin/langston_memory.py
+++ b/comms-infra/langston-memory/bin/langston_memory.py
@@ -311,9 +311,20 @@ def _parse_ledger(src):
     if not m:
         return "no-section", None
     entries = []
-    for para in re.split(r"\n- ", m.group(0))[1:]:
-        body = "- " + para.strip()
+    # finditer over the `\n- ` bullet starts so each entry carries its OFFSET in `text` (byte-equivalent char index).
+    # Same text/ids/shas/terms as the prior `re.split(r"\n- ")[1:]`; `offset` is the added field (B-LANGSTON-CONTEXT
+    # P-2 containment assert, Langston 2026-09-12) - the position of the entry's `- ` at column 0.
+    block, base = m.group(0), m.start()
+    starts = list(re.finditer(r"\n- ", block))
+    for i, sm in enumerate(starts):
+        end = starts[i + 1].start() if i + 1 < len(starts) else len(block)
+        body = "- " + block[sm.end():end].strip()
+        char_at = base + sm.start() + 1          # the entry's '- ' at column 0, as a CHAR index into text
         entries.append({"src": src, "text": body,
+                        # BYTE offset (Langston C-3, 2026-09-12): the containment guard's span and part ranges are
+                        # byte-based, and the file carries multi-byte chars - a char index would be a second coordinate
+                        # system. len(prefix.encode) converts char index -> byte offset so all three agree.
+                        "offset": len(text[:char_at].encode("utf-8")),
                         "ids": set(ID_RE.findall(body)), "shas": set(SHA_RE.findall(body)),
                         "terms": set(w.lower() for w in re.findall(r"[A-Za-z][\w\-/]{5,}", body))})
     return ("ok", entries) if entries else ("no-entries", None)
```

═══ 2. THE GUARDS (all byte-based; langston-memory-write) ═══
`ledger_span(data)` — [s,e) of the anchored `^## …REVIEWER LEDGER` block to the next column-0 `## ` or EOF; ('multi',n) if >1 heading.
`ledger_guard_problems(body, part_bodies, reader_entries, reader_status)` runs: C-1 (>1 anchored heading), condition-2 (reader status != ok — never a vacuous pass), C-2 (each of the 3 sub-sections present AND inside [s,e)), C-3 (Σ part-ranges == len(body) bytes + contiguity), block-single-part (block within ONE part range), containment (every reader entry offset in [s,e)).
`ledger_guard_after_recompose(reader, body, parts)` — the wrapper each path calls; returns the problem list so each path raises with its own restore wording.

═══ 3. WIRING — all three recompose paths ═══
- do_compose: after the retraction-count check; refuses (exit 5) naming the archive. compose has NO auto-rollback (it is the reconciliation verb — pending_sha stays set for next-time), consistent with its existing post-write failures.
- do_direct_write: the guards join the rule-4 `problems` list INSIDE the try, so a problem hits the existing THREE-WAY rollback (part + MEMORY.md + compose-state, byte-identical).
- do_rename (new): delta-0 (rename must not change ledger counts) THEN the guards, both inside the try, same three-way rollback.

═══ 4. do_rename ═══
`--rename-part OLD --to NEW` (reads no stdin, like --compose). CAS on the OLD part's sha; NEW must not exist; both names bare filenames (valid_part_name); out-of-band + parts-drift refusals; the rename is a single atomic os.rename (no both/neither window), MEMORY.md recomposed; three-way rollback = rename the part back + restore MEMORY.md + compose-state.

═══ 5. THE PROOF — 18/18, mutant runs as printed output ═══
Scratch LANGSTON_HOME on Helsinki, the real reader (my byte-offset copy). Each guard has an independent mutant proving it discriminates.
```
MATCH  R1 exit 0, old-gone True, new-present True, body-stable True
MATCH  R2 exit 0, reordered True, retr 2->2, new-present True
MATCH  R3 exit 4, both still present True: REFUSED: --to 10-core.md already exists - a rename never overwrites a part.
MATCH  R4 exit 4, not-created True: REFUSED: no part named 99-ghost.md to rename. Parts: 10-core.md, 50-notes.md.
MATCH  R5 exit 4, unchanged True: REFUSED: --expect-sha does not match the part 50-notes.md it names. It
MATCH  R6 to=.hidden.md->exit2,made=False; to=sub/x.md->exit2,made=False; to=../ESCAPED.md->exit2,made=False; to=/tmp/lmwrig-ABS.md->exit2,made=False; from=../ESCAPED->exit2
MATCH  R7 exit 2: REFUSED: --rename-part and --to are the same name '00-legacy.md' - not
MATCH  R8 exit 4, part untouched True: REFUSED: /root/lc3-test/p2rn/home/MEMORY.md was written OUTSIDE the co
MATCH  R9 exit 4, not-renamed True: REFUSED: a part in /root/lc3-test/p2rn/home/memory-parts changed since the last 
MATCH  C2 compose 0, rename exit 5, 3-leg rollback byte-identical True: REFUSED: REFUSED (ledger integrity): ledger subsection '### CC-A errors I logged' at byte 
MATCH  C5 compose 0, rename exit 5, containment-ALONE True, 3-leg rollback True: REFUSED: REFUSED (ledger integrity): 2 retraction entries OUTSIDE the block span [140,572)
MATCH  C1u problems=["2 '## …REVIEWER LEDGER' headings (anchored) - the ledger block is ambiguous"]
MATCH  C3u live span (12394, 24943), Sum(ranges)=72376, len(body)=72376, entries=9, status=ok, problems=[]
MATCH  C6u no-section status=no-section fired=True; no-entries status=no-entries fired=True; unreadable fired=True
MATCH  M-C2 mutant rename exit 0 (guarded=5), break landed True
MATCH  M-CONT mutant rename exit 0 (guarded=5), break landed True
MATCH  M-SP real caught split True, mutant silent True
MATCH  M-C3 multi-byte-present True, real-clean True, mutant-diverges True
MATCH  RDR installed-reader exit 6, wrote-first False, offset-reader exit 0: REFUSED: the reader at /opt/langston-memory/bin/langston_memory.py doe
MATCH  CC do_compose guard exit 5: REFUSED (ledger integrity): ledger subsection '### CC-A errors I logged' at byte 13 is OUT
MATCH  DW do_direct_write guard exit 5, 3-leg rollback True: REFUSED: REFUSED (ledger integrity): ledger subsection '### CC-A errors I logged' at byte 
MATCH  DELTA0 do_rename delta-0 exit 5, 3-leg rollback True: REFUSED: REFUSED (delta-0): a rename changed retraction entries -1 (must be 0 - the bytes 
MATCH  M-C1 real-caught-ambiguous True, mutant-missed True
MATCH  M-COND2 status=no-entries, real-caught True, mutant-silent True
RESULT: 24 of 24 matched
```

Note on C-5 (containment fires ALONE): the reader binds `###\s*Retractions` (flexible whitespace); the C-2 canary matches the exact `### Retractions`. A decoy `###   Retractions` (3 spaces) with 2 bullets, moved before the span by the rename, is bound by the reader (2 entries out of span → containment) but SKIPPED by the exact C-2 find (lands on the real one, in span) and leaves the count at 2 (delta-0 passes). So containment is the only tripwire — the byte offset is what makes it catchable.

Note on coordinate alignment: reader offsets are byte offsets into the full file (incl. the trailing stamp), the guard's span/ranges are on the pre-stamp body. Safe because every ledger byte precedes the appended stamp, so offsets coincide over the block. C3u is the positive control on the LIVE file: span (12394,24943) == your own measure, Σ=72376==len(body), 9 entries, clean.

═══ 6. WHAT A FRESH-READER PASS ALREADY CHANGED (so you review the corrected object) ═══
A fresh-context reviewer (Kyle's standing second-reader mechanism) found, and I fixed + re-proved, before sending you this:
- **Reader coupling (the big one).** The guards need the reader's byte offset. With the OLD installed reader (no offset), the containment guard read a missing offset as -1 and refused EVERY compose/rename as "ledger corruption" (reproduced on the box: exit 5 "... at byte None"). FIX: `reader_requires_offsets(reader)` probes the reader up front and refuses (exit 6) with a clear reader-VERSION-mismatch message before any write — so the reader change and the writer must ship together, and a future reader that drops the field fails loud, not silently. Proven by RDR (exit 6, no write) with the offset reader as the control.
- Only do_rename was integration-tested for the guards; added CC (do_compose) and DW (do_direct_write) guard-fires. Added the delta-0-fires case, C-1 and condition-2 mutants (every guard now has an independent mutant), and a compose-state byte-check to the rollback legs.

═══ 7. HONEST LIMITS / DECISIONS FOR YOU (not silently glossed) ═══
- **C-3 (Σ ranges == len(body)) can only fire from a CODE bug, never from parts data** — body and part_bodies both derive from the same `parts`, so the sum is tautologically equal on real input. It is a coordinate-consistency CANARY (proven load-bearing by M-C3, which shows a char-vs-byte mutant diverges) + the live positive control C3u, not a data guard. Kept as a cheap tripwire; flagging that it is not more than that.
- **`do_direct_write_legacy` (the pre-migration, no-parts path) carries NONE of the four byte guards** — only the count checks. It is unreachable on the migrated box (parts present), but it is live code. Decision for you: guard it too (the reader-based subset — span/subsections/containment apply; part-ranges do not), or leave it as the dead path the retrofit will retire? I lean leave-and-note, but it is your call.
- **Coverage boundary:** the reader binds only the FIRST `### Retractions` and parses only that subsection, so (a) a DUPLICATE ledger subsection heading placed AFTER the canonical block is invisible to all four guards (only one that sorts BEFORE trips C-2/containment), and (b) relocated Rulings/CC-A *bullets* (heading unmoved) produce no reader entry and are not containment-checked. Containment protects retraction entries. Stating the boundary rather than implying full coverage.

QUESTION: any hole in the guard set, the wiring, the rename's crash/rollback semantics, or the reader-coupling fix before I commit this as one unit and move to the retrofit? And your call on the legacy-path guard (§7).

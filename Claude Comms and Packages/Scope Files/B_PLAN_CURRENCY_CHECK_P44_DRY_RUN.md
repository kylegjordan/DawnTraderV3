# B-PLAN-CURRENCY-CHECK — P44 DRY RUN (the committed baseline the first live census differs from)

**THIS FILE REPLACES the pre-audit's hand-counted placement figures (352 / 117, 354 / 115)** — they were counts from scratch scripts not kept, so the residual (−7 / −9 placed at the same ref and denominator, the `--open-r1` run below) cannot be attributed per issue; Langston ruled them retired, not reconciled (G7-8, round 2). Langston, Step 4 G7-12 (2026-09-30): the full stdout, the exact command line and the ref, in the file — not a summary. Produced by the census code at the code-branch head (G7 conditions applied, not yet on the review branch), reading governed files AT the ref named in each run (`git show <ref>:<path>`).

## `node scripts/governance-checker/census.mjs --dry-run --ref e18cb870b01c943c91bff03d5f2e6760820ee1be `

```
census dry run at e18cb870b01c943c91bff03d5f2e6760820ee1be (list (a) window 7f472d1c4fbea63c6db105aa7a38c160a8a95637..e18cb870b01c943c91bff03d5f2e6760820ee1be; week of the ref 2026-W40)
self-check: heads 793 · numbers 687 · OPEN 535 (R1 483; widened S1 46, S2 8)
(b) placed 387 (number 226 · HOME batch 150 · parked 2 · roadmap 9) · unplaced 148 {"U1":51,"U2":50,"U3":5,"U4":3,"U5":16,"U6":23}
    R1-Q13 (a)↔(c) delta: 18 issue(s) place differently when every note-cell mention counts: #375→number #393→number #498→number #532→number #535→number #546→number #578→number #596→number #652→number #688→number #698→number #732→number #924→number #928→number #953→number #1022→number #1051→number #1102→number
    self-contradicting sub-list (3): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 12 issues / 13 lines / 13 matches
(c) R1w × R2: 13 issues / 14 lines / 14 matches
(c) R1 × R2+OWNER: 12 issues / 14 lines / 14 matches
(c) R1w × R2+OWNER, #696 counted: 13 issues / 15 lines / 15 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 12 issues / 13 lines / 13 matches (excluded #696)
    list (c) as ruled: #444 #451 #455 #480 #481 #485 #680 #681 #682 #684 #705 #908
(d) 0 rows:  · excluded 0: 
(e) type (i)+§0 refs 56 · unmatched 0 · resolved via §0 1 (160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 59, unmatched 0
    unmatched: 
(f) 5 lines / 4 ids: §4:55:B-RTB-REFRESH-CONSOLIDATE §0:B-MEASURE-GATE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT
(a) 1: F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":62,"CC-C":66,"CC-B":56,"CC-INFRA":56} · table {"CC-C":66,"CC-INFRA":56,"CC-B":56,"CC-A":62} · agree · stated Total 240 vs cells 240 (agree)
owner sources over the 535 OPEN issues (shown-as): {"ownerLine":364,"homeLine":43,"filer":25,"unknown":103}
owner per-source counts (overlapping): {"ownerLine":364,"homeLine":369,"filer":322}
    10-item hand-check sample, ownerLine: #206=CC-B #341=CC-A #348=CC-A #352=CC-B #392=CC-B #444=CC-B #448=CC-A #451=CC-A #452=CC-A #453=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #337=CC-B #341=CC-A #348=CC-A #352=CC-A #371=CC-B #372=CC-B #385=CC-B #391=CC-B #392=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #337=CC-B #341=CC-A #348=CC-A #352=CC-A #395=CC-B #441=CC-A #443=CC-A #444=CC-B
counts {"h":793,"n":687,"o":535,"a":[0,1],"b":[387,148,226,150,2,9,51,50,5,3,16,23],"c":[12,13,13],"cx":1,"d":0,"dx":0,"e":[56,0],"f":[5,5],"g":0,"sc":3,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (952):
Weekly plan census 2026-W40 at e18cb87. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 1 in no plan line [owner ? 1] — F_G_2_COMPLETION_REPORT.md (in-no-plan-line, owner ?)
(b) OPEN 535: placed 387 (by # 226, HOME batch 150, parked 2, roadmap 9), unplaced 148 [owner ? 55] — #146 no HOME line (owner ?); self-contradicting 3, reused 8
(c) dated homes: 12 issues / 13 lines (excluded by name 1) [owner ? 0] — #444 (owner CC-B)
(d) id-less plan rows: 0 (excluded 0) [owner ? 0]
(e) after-references: 115, 0 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 5 NEW of 5 [owner ? 0] — §4 row 55 B-RTB-REFRESH-CONSOLIDATE (CC-B)
(g) §6 recount agrees with the table
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```

## `node scripts/governance-checker/census.mjs --dry-run --ref 9d80cd991 `

```
census dry run at 9d80cd991 (list (a) window c5a1ada2d274a63bedfbb42d486b621a263f88e9..9d80cd991; week of the ref 2026-W40)
self-check: heads 766 · numbers 663 · OPEN 523 (R1 469; widened S1 48, S2 8)
(b) placed 365 (number 185 · HOME batch 165 · parked 5 · roadmap 10) · unplaced 158 {"U1":51,"U2":51,"U3":5,"U4":3,"U5":23,"U6":25}
    R1-Q13 (a)↔(c) delta: 19 issue(s) place differently when every note-cell mention counts: #375→number #393→number #498→number #546→number #578→number #652→number #688→number #698→number #705→number #732→number #742→number #743→number #900→number #903→number #910→number #924→number #1051→number #1102→number #1104→homeBatch
    self-contradicting sub-list (5): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #456@L533 (head carries "RETRACTED" before its final OPEN; filer ?) · #450@L535 (head carries "DISPOSITIONED" before its final OPEN; filer CC-B) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 30 issues / 39 lines / 41 matches
(c) R1w × R2: 33 issues / 42 lines / 44 matches
(c) R1 × R2+OWNER: 33 issues / 44 lines / 46 matches
(c) R1w × R2+OWNER, #696 counted: 36 issues / 47 lines / 49 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 35 issues / 45 lines / 47 matches (excluded #696)
    list (c) as ruled: #443 #444 #448 #449 #450 #451 #452 #453 #455 #456 #480 #481 #483 #484 #485 #486 #487 #492 #493 #494 #680 #681 #682 #684 #705 #738 #742 #743 #900 #901 #902 #903 #908 #909 #910
(d) 5 rows: 16 (status "REOPENED — Step 3"); 107 (item cell is one batch id); 120 (item cell is one batch id); 148 (item cell is one batch id); 157 (item cell is one batch id) · excluded 0: 
(e) type (i)+§0 refs 87 · unmatched 33 · resolved via §0 2 (107a→T-W20C-SCALAR-LEG, 160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 6, unmatched 0
    unmatched: 100:row:6 100:row:7 100:RESTING-ORDER-DEADLINE 100:row:3h.b 126:ACCUMULATION-GATE 127:ACCUMULATION-GATE 128:ACCUMULATION-GATE 129:ACCUMULATION-GATE 130:ACCUMULATION-GATE 131:ACCUMULATION-GATE 132:ACCUMULATION-GATE 133:ACCUMULATION-GATE 134:ACCUMULATION-GATE 136:ACCUMULATION-GATE 137:ACCUMULATION-GATE 138:ACCUMULATION-GATE 139:ACCUMULATION-GATE 140:ACCUMULATION-GATE 141:ACCUMULATION-GATE 142:ACCUMULATION-GATE 143:ACCUMULATION-GATE 144:ACCUMULATION-GATE 145:ACCUMULATION-GATE 146:ACCUMULATION-GATE 147:ACCUMULATION-GATE 149:ACCUMULATION-GATE 150:ACCUMULATION-GATE 151:ACCUMULATION-GATE 152:ACCUMULATION-GATE 153:ACCUMULATION-GATE 191:PROCESS-DEATH-FORM 194:KRAKEN-LIVE-KEY 195:rm:25-16
(f) 9 lines / 7 ids: §4:35:B-WS-SUBSCRIBE-CLASS-FILTER §4:55:B-RTB-REFRESH-CONSOLIDATE §4:87:B-COST-MATH-CONSOLIDATION §0:B-MEASURE-GATE §0:B-DEPLOY-DRIFT-LINE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT §5:B-DEPLOY-DRIFT-LINE
(a) 2: B_BALANCE_TRUTH_COMPLETION_REPORT.md (in-no-plan-line); F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":51,"CC-C":57,"CC-INFRA":53,"CC-B":53} · table {"CC-C":51,"CC-INFRA":52,"CC-B":53,"CC-A":50} · DISAGREE, alert=true, commit 17d2342934cdf09897abb5bb411ca9b06ed8d68d · stated Total NOT FOUND vs cells 206 (DISAGREE)
owner sources over the 523 OPEN issues (shown-as): {"ownerLine":346,"homeLine":45,"filer":25,"unknown":107}
owner per-source counts (overlapping): {"ownerLine":346,"homeLine":350,"filer":316}
    10-item hand-check sample, ownerLine: #206=CC-B #348=CC-A #352=CC-B #392=CC-B #444=CC-B #448=CC-A #449=CC-B #450=CC-A #452=CC-A #453=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #337=CC-B #341=CC-A #348=CC-A #352=CC-A #371=CC-B #372=CC-B #385=CC-B #391=CC-B #392=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #337=CC-B #341=CC-A #348=CC-A #352=CC-A #395=CC-B #441=CC-A #443=CC-A #444=CC-B
counts {"h":766,"n":663,"o":523,"a":[0,2],"b":[365,158,185,165,5,10,51,51,5,3,23,25],"c":[35,45,47],"cx":1,"d":5,"dx":0,"e":[87,33],"f":[9,9],"g":1,"sc":5,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (865):
Weekly plan census 2026-W40 at 9d80cd9. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 2 in no plan line [owner ? 2]
(b) OPEN 523: placed 365 (by # 185, HOME batch 165, parked 5, roadmap 10), unplaced 158 [owner ? 55]; self-contradicting 5, reused 8
(c) dated homes: 35 issues / 45 lines (excluded by name 1) [owner ? 0]
(d) id-less plan rows: 5 (excluded 0) [owner ? 0]
(e) after-references: 93, 33 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 9 NEW of 9 [owner ? 0]
(g) Total —≠206; §6 recount vs table: CC-A 51/50, CC-C 57/51, CC-INFRA 53/52; not recounted with §4
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```

## `node scripts/governance-checker/census.mjs --dry-run --ref 9d80cd991 --open-r1`

```
census dry run at 9d80cd991 (list (a) window c5a1ada2d274a63bedfbb42d486b621a263f88e9..9d80cd991; week of the ref 2026-W40)
self-check: heads 766 · numbers 663 · OPEN 469 (R1 469; widened S1 48, S2 8)
(b) placed 345 (number 179 · HOME batch 156 · parked 4 · roadmap 6) · unplaced 124 {"U1":46,"U2":33,"U3":4,"U4":3,"U5":22,"U6":16}
    R1-Q13 (a)↔(c) delta: 18 issue(s) place differently when every note-cell mention counts: #393→number #498→number #546→number #578→number #652→number #688→number #698→number #705→number #732→number #742→number #743→number #900→number #903→number #910→number #924→number #1051→number #1102→number #1104→homeBatch
    self-contradicting sub-list (5): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #456@L533 (head carries "RETRACTED" before its final OPEN; filer ?) · #450@L535 (head carries "DISPOSITIONED" before its final OPEN; filer CC-B) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 30 issues / 39 lines / 41 matches
(c) R1w × R2: 30 issues / 39 lines / 41 matches
(c) R1 × R2+OWNER: 33 issues / 44 lines / 46 matches
(c) R1w × R2+OWNER, #696 counted: 33 issues / 44 lines / 46 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 32 issues / 42 lines / 44 matches (excluded #696)
    list (c) as ruled: #443 #444 #448 #449 #452 #453 #455 #480 #481 #483 #484 #485 #486 #487 #492 #493 #494 #680 #681 #682 #684 #705 #738 #742 #743 #900 #901 #902 #903 #908 #909 #910
(d) 5 rows: 16 (status "REOPENED — Step 3"); 107 (item cell is one batch id); 120 (item cell is one batch id); 148 (item cell is one batch id); 157 (item cell is one batch id) · excluded 0: 
(e) type (i)+§0 refs 87 · unmatched 33 · resolved via §0 2 (107a→T-W20C-SCALAR-LEG, 160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 6, unmatched 0
    unmatched: 100:row:6 100:row:7 100:RESTING-ORDER-DEADLINE 100:row:3h.b 126:ACCUMULATION-GATE 127:ACCUMULATION-GATE 128:ACCUMULATION-GATE 129:ACCUMULATION-GATE 130:ACCUMULATION-GATE 131:ACCUMULATION-GATE 132:ACCUMULATION-GATE 133:ACCUMULATION-GATE 134:ACCUMULATION-GATE 136:ACCUMULATION-GATE 137:ACCUMULATION-GATE 138:ACCUMULATION-GATE 139:ACCUMULATION-GATE 140:ACCUMULATION-GATE 141:ACCUMULATION-GATE 142:ACCUMULATION-GATE 143:ACCUMULATION-GATE 144:ACCUMULATION-GATE 145:ACCUMULATION-GATE 146:ACCUMULATION-GATE 147:ACCUMULATION-GATE 149:ACCUMULATION-GATE 150:ACCUMULATION-GATE 151:ACCUMULATION-GATE 152:ACCUMULATION-GATE 153:ACCUMULATION-GATE 191:PROCESS-DEATH-FORM 194:KRAKEN-LIVE-KEY 195:rm:25-16
(f) 9 lines / 7 ids: §4:35:B-WS-SUBSCRIBE-CLASS-FILTER §4:55:B-RTB-REFRESH-CONSOLIDATE §4:87:B-COST-MATH-CONSOLIDATION §0:B-MEASURE-GATE §0:B-DEPLOY-DRIFT-LINE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT §5:B-DEPLOY-DRIFT-LINE
(a) 2: B_BALANCE_TRUTH_COMPLETION_REPORT.md (in-no-plan-line); F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":51,"CC-C":57,"CC-INFRA":53,"CC-B":53} · table {"CC-C":51,"CC-INFRA":52,"CC-B":53,"CC-A":50} · DISAGREE, alert=true, commit 17d2342934cdf09897abb5bb411ca9b06ed8d68d · stated Total NOT FOUND vs cells 206 (DISAGREE)
owner sources over the 469 OPEN issues (shown-as): {"ownerLine":334,"homeLine":32,"filer":25,"unknown":78}
owner per-source counts (overlapping): {"ownerLine":334,"homeLine":327,"filer":310}
    10-item hand-check sample, ownerLine: #206=CC-B #352=CC-B #392=CC-B #444=CC-B #448=CC-A #449=CC-B #452=CC-A #453=CC-A #455=CC-A #462=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #341=CC-A #352=CC-A #391=CC-B #392=CC-B #393=CC-B #395=CC-B #396=CC-B #398=CC-B #399=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #341=CC-A #352=CC-A #395=CC-B #443=CC-A #444=CC-B #445=CC-B #446=CC-A #448=CC-A
counts {"h":766,"n":663,"o":469,"a":[0,2],"b":[345,124,179,156,4,6,46,33,4,3,22,16],"c":[32,42,44],"cx":1,"d":5,"dx":0,"e":[87,33],"f":[9,9],"g":1,"sc":5,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (864):
Weekly plan census 2026-W40 at 9d80cd9. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 2 in no plan line [owner ? 2]
(b) OPEN 469: placed 345 (by # 179, HOME batch 156, parked 4, roadmap 6), unplaced 124 [owner ? 31]; self-contradicting 5, reused 8
(c) dated homes: 32 issues / 42 lines (excluded by name 1) [owner ? 0]
(d) id-less plan rows: 5 (excluded 0) [owner ? 0]
(e) after-references: 93, 33 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 9 NEW of 9 [owner ? 0]
(g) Total —≠206; §6 recount vs table: CC-A 51/50, CC-C 57/51, CC-INFRA 53/52; not recounted with §4
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```

## `node scripts/governance-checker/census.mjs --dry-run --ref c6751f5b3 `

```
census dry run at c6751f5b3 (list (a) window 85b8fa898153c58dfc735b39adb325a51825ab2a..c6751f5b3; week of the ref 2026-W40)
self-check: heads 782 · numbers 676 · OPEN 532 (R1 479; widened S1 47, S2 8)
(b) placed 377 (number 197 · HOME batch 166 · parked 5 · roadmap 9) · unplaced 155 {"U1":51,"U2":51,"U3":5,"U4":3,"U5":20,"U6":25}
    R1-Q13 (a)↔(c) delta: 17 issue(s) place differently when every note-cell mention counts: #375→number #393→number #498→number #532→number #535→number #546→number #578→number #652→number #688→number #698→number #732→number #924→number #928→number #953→number #1051→number #1102→number #1121→number
    self-contradicting sub-list (5): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #456@L533 (head carries "RETRACTED" before its final OPEN; filer ?) · #450@L535 (head carries "DISPOSITIONED" before its final OPEN; filer CC-B) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 30 issues / 39 lines / 41 matches
(c) R1w × R2: 33 issues / 42 lines / 44 matches
(c) R1 × R2+OWNER: 33 issues / 44 lines / 46 matches
(c) R1w × R2+OWNER, #696 counted: 36 issues / 47 lines / 49 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 35 issues / 45 lines / 47 matches (excluded #696)
    list (c) as ruled: #443 #444 #448 #449 #450 #451 #452 #453 #455 #456 #480 #481 #483 #484 #485 #486 #487 #492 #493 #494 #680 #681 #682 #684 #705 #738 #742 #743 #900 #901 #902 #903 #908 #909 #910
(d) 0 rows:  · excluded 0: 
(e) type (i)+§0 refs 53 · unmatched 0 · resolved via §0 1 (160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 49, unmatched 0
    unmatched: 
(f) 6 lines / 5 ids: §4:55:B-RTB-REFRESH-CONSOLIDATE §4:87:B-COST-MATH-CONSOLIDATION §0:B-MEASURE-GATE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT
(a) 2: B_BALANCE_TRUTH_COMPLETION_REPORT.md (in-no-plan-line); F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":56,"CC-C":62,"CC-INFRA":54,"CC-B":53} · table {"CC-C":51,"CC-INFRA":52,"CC-B":53,"CC-A":50} · DISAGREE, alert=true, commit e8b7b65f602dbf037f95d79f8d156396a7ab73e0 · stated Total NOT FOUND vs cells 206 (DISAGREE)
owner sources over the 532 OPEN issues (shown-as): {"ownerLine":359,"homeLine":46,"filer":24,"unknown":103}
owner per-source counts (overlapping): {"ownerLine":359,"homeLine":365,"filer":321}
    10-item hand-check sample, ownerLine: #206=CC-B #348=CC-A #352=CC-B #392=CC-B #444=CC-B #448=CC-A #449=CC-B #450=CC-A #452=CC-A #453=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #337=CC-B #341=CC-A #348=CC-A #352=CC-A #371=CC-B #372=CC-B #385=CC-B #391=CC-B #392=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #337=CC-B #341=CC-A #348=CC-A #352=CC-A #395=CC-B #441=CC-A #443=CC-A #444=CC-B
counts {"h":782,"n":676,"o":532,"a":[0,2],"b":[377,155,197,166,5,9,51,51,5,3,20,25],"c":[35,45,47],"cx":1,"d":0,"dx":0,"e":[53,0],"f":[6,6],"g":1,"sc":5,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (864):
Weekly plan census 2026-W40 at c6751f5. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 2 in no plan line [owner ? 2]
(b) OPEN 532: placed 377 (by # 197, HOME batch 166, parked 5, roadmap 9), unplaced 155 [owner ? 55]; self-contradicting 5, reused 8
(c) dated homes: 35 issues / 45 lines (excluded by name 1) [owner ? 0]
(d) id-less plan rows: 0 (excluded 0) [owner ? 0]
(e) after-references: 102, 0 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 6 NEW of 6 [owner ? 0]
(g) Total —≠206; §6 recount vs table: CC-A 56/50, CC-C 62/51, CC-INFRA 54/52; not recounted with §4
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```

## `node scripts/governance-checker/census.mjs --dry-run --ref d4a2679c4 `

```
census dry run at d4a2679c4 (list (a) window bab328b622c23e81b4b2053e00010b8062f8d836..d4a2679c4; week of the ref 2026-W40)
self-check: heads 770 · numbers 667 · OPEN 526 (R1 472; widened S1 48, S2 8)
(b) placed 369 (number 188 · HOME batch 166 · parked 5 · roadmap 10) · unplaced 157 {"U1":51,"U2":51,"U3":5,"U4":3,"U5":22,"U6":25}
    R1-Q13 (a)↔(c) delta: 18 issue(s) place differently when every note-cell mention counts: #375→number #393→number #498→number #546→number #578→number #652→number #688→number #698→number #705→number #732→number #742→number #743→number #900→number #903→number #910→number #924→number #1051→number #1102→number
    self-contradicting sub-list (5): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #456@L533 (head carries "RETRACTED" before its final OPEN; filer ?) · #450@L535 (head carries "DISPOSITIONED" before its final OPEN; filer CC-B) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 30 issues / 39 lines / 41 matches
(c) R1w × R2: 33 issues / 42 lines / 44 matches
(c) R1 × R2+OWNER: 33 issues / 44 lines / 46 matches
(c) R1w × R2+OWNER, #696 counted: 36 issues / 47 lines / 49 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 35 issues / 45 lines / 47 matches (excluded #696)
    list (c) as ruled: #443 #444 #448 #449 #450 #451 #452 #453 #455 #456 #480 #481 #483 #484 #485 #486 #487 #492 #493 #494 #680 #681 #682 #684 #705 #738 #742 #743 #900 #901 #902 #903 #908 #909 #910
(d) 5 rows: 16 (status "REOPENED — Step 3"); 107 (item cell is one batch id); 120 (item cell is one batch id); 148 (item cell is one batch id); 157 (item cell is one batch id) · excluded 0: 
(e) type (i)+§0 refs 87 · unmatched 33 · resolved via §0 2 (107a→T-W20C-SCALAR-LEG, 160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 10, unmatched 0
    unmatched: 100:row:6 100:row:7 100:RESTING-ORDER-DEADLINE 100:row:3h.b 126:ACCUMULATION-GATE 127:ACCUMULATION-GATE 128:ACCUMULATION-GATE 129:ACCUMULATION-GATE 130:ACCUMULATION-GATE 131:ACCUMULATION-GATE 132:ACCUMULATION-GATE 133:ACCUMULATION-GATE 134:ACCUMULATION-GATE 136:ACCUMULATION-GATE 137:ACCUMULATION-GATE 138:ACCUMULATION-GATE 139:ACCUMULATION-GATE 140:ACCUMULATION-GATE 141:ACCUMULATION-GATE 142:ACCUMULATION-GATE 143:ACCUMULATION-GATE 144:ACCUMULATION-GATE 145:ACCUMULATION-GATE 146:ACCUMULATION-GATE 147:ACCUMULATION-GATE 149:ACCUMULATION-GATE 150:ACCUMULATION-GATE 151:ACCUMULATION-GATE 152:ACCUMULATION-GATE 153:ACCUMULATION-GATE 191:PROCESS-DEATH-FORM 194:KRAKEN-LIVE-KEY 195:rm:25-16
(f) 8 lines / 7 ids: §4:35:B-WS-SUBSCRIBE-CLASS-FILTER §4:55:B-RTB-REFRESH-CONSOLIDATE §4:87:B-COST-MATH-CONSOLIDATION §0:B-MEASURE-GATE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT §5:B-DEPLOY-DRIFT-LINE
(a) 2: B_BALANCE_TRUTH_COMPLETION_REPORT.md (in-no-plan-line); F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":52,"CC-C":60,"CC-INFRA":53,"CC-B":53} · table {"CC-C":51,"CC-INFRA":52,"CC-B":53,"CC-A":50} · DISAGREE, alert=true, commit b543448c27de919501389b10537b279adc089a60 · stated Total NOT FOUND vs cells 206 (DISAGREE)
owner sources over the 526 OPEN issues (shown-as): {"ownerLine":350,"homeLine":46,"filer":25,"unknown":105}
owner per-source counts (overlapping): {"ownerLine":350,"homeLine":355,"filer":318}
    10-item hand-check sample, ownerLine: #206=CC-B #348=CC-A #352=CC-B #392=CC-B #444=CC-B #448=CC-A #449=CC-B #450=CC-A #452=CC-A #453=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #337=CC-B #341=CC-A #348=CC-A #352=CC-A #371=CC-B #372=CC-B #385=CC-B #391=CC-B #392=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #337=CC-B #341=CC-A #348=CC-A #352=CC-A #395=CC-B #441=CC-A #443=CC-A #444=CC-B
counts {"h":770,"n":667,"o":526,"a":[0,2],"b":[369,157,188,166,5,10,51,51,5,3,22,25],"c":[35,45,47],"cx":1,"d":5,"dx":0,"e":[87,33],"f":[8,8],"g":1,"sc":5,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (865):
Weekly plan census 2026-W40 at d4a2679. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 2 in no plan line [owner ? 2]
(b) OPEN 526: placed 369 (by # 188, HOME batch 166, parked 5, roadmap 10), unplaced 157 [owner ? 55]; self-contradicting 5, reused 8
(c) dated homes: 35 issues / 45 lines (excluded by name 1) [owner ? 0]
(d) id-less plan rows: 5 (excluded 0) [owner ? 0]
(e) after-references: 97, 33 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 8 NEW of 8 [owner ? 0]
(g) Total —≠206; §6 recount vs table: CC-A 52/50, CC-C 60/51, CC-INFRA 53/52; not recounted with §4
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```


## P62 pre-registration — `node scripts/governance-checker/census.mjs --dry-run --ref ac7a21812f383175a597d7bf425af9c0b6125d1e` (2026-09-30, the base of the census flip)

The census flip fires the 2026-W40 census on its first tick (mid-week enable fires at once). This is the expected content.

```
census dry run at ac7a21812f383175a597d7bf425af9c0b6125d1e (list (a) window 7f472d1c4fbea63c6db105aa7a38c160a8a95637..ac7a21812f383175a597d7bf425af9c0b6125d1e; week of the ref 2026-W40)
self-check: heads 797 · numbers 691 · OPEN 539 (R1 487; widened S1 46, S2 8)
(b) placed 391 (number 230 · HOME batch 150 · parked 2 · roadmap 9) · unplaced 148 {"U1":51,"U2":50,"U3":5,"U4":3,"U5":16,"U6":23}
    R1-Q13 (a)↔(c) delta: 19 issue(s) place differently when every note-cell mention counts: #375→number #393→number #498→number #532→number #535→number #546→number #578→number #596→number #652→number #688→number #698→number #732→number #924→number #928→number #953→number #1008→number #1022→number #1051→number #1102→number
    self-contradicting sub-list (3): #1098@L165 (head carries "CLOSED" before its final OPEN; filer CC-B) · #532@L315 (head carries "CLOSED" before its final OPEN; filer ?) · #348@L563 (head carries "RESOLVED" before its final OPEN; filer CC-A)
    reused numbers (8): #559 #561 #642 #646 #648 #660 #741 #921
(c) R1 × R2: 12 issues / 13 lines / 13 matches
(c) R1w × R2: 13 issues / 14 lines / 14 matches
(c) R1 × R2+OWNER: 12 issues / 14 lines / 14 matches
(c) R1w × R2+OWNER, #696 counted: 13 issues / 15 lines / 15 matches
(c) R1w × R2+OWNER, #696 excluded (Q25): 12 issues / 13 lines / 13 matches (excluded #696)
    list (c) as ruled: #444 #451 #455 #480 #481 #485 #680 #681 #682 #684 #705 #908
(d) 0 rows:  · excluded 0: 
(e) type (i)+§0 refs 57 · unmatched 0 · resolved via §0 1 (160a→B-CREDENTIALS-PRIVATE-REPO) · "after row N" 62, unmatched 0
    unmatched: 
(f) 5 lines / 4 ids: §4:55:B-RTB-REFRESH-CONSOLIDATE §0:B-MEASURE-GATE §0:B-XSTOCK-FEE-CONTRACT §0:B-WAKE-LEAD-NAME §5:B-XSTOCK-FEE-CONTRACT
(a) 1: F_G_2_COMPLETION_REPORT.md (in-no-plan-line)
(g) §6: recount {"CC-A":63,"CC-INFRA":57,"CC-C":66,"CC-B":58} · table {"CC-C":66,"CC-INFRA":57,"CC-B":58,"CC-A":63} · agree · stated Total 244 vs cells 244 (agree)
owner sources over the 539 OPEN issues (shown-as): {"ownerLine":368,"homeLine":43,"filer":25,"unknown":103}
owner per-source counts (overlapping): {"ownerLine":368,"homeLine":373,"filer":324}
    10-item hand-check sample, ownerLine: #206=CC-B #341=CC-A #348=CC-A #352=CC-B #392=CC-B #444=CC-B #448=CC-A #451=CC-A #452=CC-A #453=CC-A
    10-item hand-check sample, homeLine: #297=CC-A #337=CC-B #341=CC-A #348=CC-A #352=CC-A #371=CC-B #372=CC-B #385=CC-B #391=CC-B #392=CC-B
    10-item hand-check sample, filer: #206=CC-B #297=CC-C #337=CC-B #341=CC-A #348=CC-A #352=CC-A #395=CC-B #441=CC-A #443=CC-A #444=CC-B
counts {"h":797,"n":691,"o":539,"a":[0,1],"b":[391,148,230,150,2,9,51,50,5,3,16,23],"c":[12,13,13],"cx":1,"d":0,"dx":0,"e":[57,0],"f":[5,5],"g":0,"sc":3,"r":8}
title (63): Weekly plan census 2026-W40: sprint plan vs ledger (owner CC-A)
body (952):
Weekly plan census 2026-W40 at ac7a218. owner=CC-A, do not ack. action="run the weekly census worklist; resolve this row when the listed items are dispositioned".
(a) new reports: 0 not closed in plan, 1 in no plan line [owner ? 1] — F_G_2_COMPLETION_REPORT.md (in-no-plan-line, owner ?)
(b) OPEN 539: placed 391 (by # 230, HOME batch 150, parked 2, roadmap 9), unplaced 148 [owner ? 55] — #146 no HOME line (owner ?); self-contradicting 3, reused 8
(c) dated homes: 12 issues / 13 lines (excluded by name 1) [owner ? 0] — #444 (owner CC-B)
(d) id-less plan rows: 0 (excluded 0) [owner ? 0]
(e) after-references: 119, 0 name no earlier row [owner ? 0]
(f) not-closed plan lines with a report: 5 NEW of 5 [owner ? 0] — §4 row 55 B-RTB-REFRESH-CONSOLIDATE (CC-B)
(g) §6 recount agrees with the table
Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file /var/lib/governance-checker/census/2026-W40.json.
```

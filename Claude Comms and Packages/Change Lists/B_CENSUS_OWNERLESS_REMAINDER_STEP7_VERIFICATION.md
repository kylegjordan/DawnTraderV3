# B-CENSUS-OWNERLESS-REMAINDER — STEP 7 VERIFICATION (CC-A, 2026-10-08)

**Deployed:** the checker self-deployed at its 03:39:41Z tick (`ExecStartPre` fetch + `merge --ff-only`); box clone `/opt/governance-checker/DawnTraderV3` at `68af4ccbf`, which contains the code commits `9dbc86c47` + `d728f903d` (cherry-picks of the reviewed `8655a1bfd` + `2fc2fcdd9`; `git diff` against the review branch over `scripts/governance-checker/`: empty). Tick: `opened=2 resolved=104`, exit clean.
**Instrument:** `node scripts/governance-checker/census.mjs --ref <sha> --dry-run` on the box clone, as the clone's owner. The ledger is read AT the ref; the code is the deployed code.

| obj | result | evidence |
|---|---|---|
| **OBJ-1** owner the census reads, OLD predicate | **unknown 0 of 504 open** at `68af4ccbf` | owner sources `{"ownerLine":455,"homeLine":34,"filer":15,"placingLine":0,"unknown":0}`. `placingLine` is only reached when the old predicate returns unknown, so `placingLine 0` ⇒ the old predicate reads unknown for none. **Control** (`035d0f7e5`, pre-batch ledger, same code): `ownerLine 407 · homeLine 34 · filer 15 · placingLine 19 · unknown 29` = 48 the old predicate cannot read. |
| **OBJ-2** owner = the placing line (19 discriminating) | **18 of 18 reachable match; #375 matched by hand; #302 closed** | The control lists 19 as `placing-line <session>`: the 19 pre-registered (18 §4-named + `#537`) minus `#375`, plus `#302` — 17 + 1 + 1. *(Corrected at Step 10, Langston Step-8 record item: this line first read "the 18 pre-registered", which does not reconcile.)* Each compared with the W41 owner line written by this batch: 18 OK; `#302` has no owner line by construction (CLOSED). **`#375`** is placed by `HOME: Phase-25` (roadmap) and its §4 mention is `+ #370 and #375` (the homing form catches only the first number), so the census has no placing line for it — consistent with the function's documented legs (no roadmap leg; Langston Step 4 FINDING). By hand: §4 row 153 owner `CC-A (Old Claude)`; written `OWNER CC-A — §4 row 153`. 19/19. |
| **OBJ-3** list (b′) | **(b′) placed but ownerless (0)** at `68af4ccbf`; body line `placed but ownerless 0` | **Positive control:** at `035d0f7e5` the same code lists **(b′) 48** — 19 `placing-line …`, 29 `owner ?` — the 48 this batch set out to own. The unit tests (`#303` HOME leg, `#304` note leg) are Langston's mutation-checked controls. |
| **OBJ-4** handovers | posted 2026-10-07 by number: CC-B 15, Infra Claude 15, CC-C 3 | no refusal received |
| **OBJ-5** §6 | `(g) §6: recount … agree · stated Total 291 vs cells 291 (agree)` | dry run |

**Test counts reconciled (Langston's Step-4 record item):** poller **446** on Linux (CI run `37722634604`, and his Helsinki run) vs **443** on this Windows laptop — `poller.test.mjs:1500-1517` runs 3 inode assertions on Linux only. Census **168** on the laptop and on Helsinki vs **167** in CI — CI prints `(C2 live existing-parent leg skipped: shallow clone — every parent is absent there)`. Neither is a hidden failure.

**CI:** run `37722634604` at `d728f903d` — TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅ (per job).

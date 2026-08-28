# B-TOKEN-WATCH — CHANGE LIST (Step 4)

> ⛔⛔ **REFRESHED AT THE APPROVED REF — THE FIGURES BELOW WERE THE r1 SUBMISSION'S AND SURVIVED THREE ROUNDS OF REVIEW UNCHANGED.**
> **APPROVED AT r3, `3c6e6ced3`.** Langston re-read every module and all five suites himself and cleared all three blockers, both rulings and all three conditions.
> ★ **This refresh is not housekeeping.** He made me purge superseded values from two other files this same round, on the reasoning that **in a package whose defence is that every number is traced inline, a stale trace is the defect wearing the fix's clothes.** The same standard applies to the document that describes the package. **The r1 figures are preserved below the line, labelled, rather than deleted — a reviewer must be able to find what he read.**

## THE APPROVED STATE — re-derived, not remembered

| | r1 submission | **APPROVED r3** |
|---|---|---|
| suites | 2 | **5** |
| checks | 57 | **141** |
| module lines | 1,430 | **2,382** |
| test lines | 449 | **1,289** |
| review rounds | — | **r1 CHANGES-NEEDED → r2 CHANGES-NEEDED → r3 APPROVED** |
| fresh-reader rounds | 0 | **3** (capped; did NOT converge — each found more than the last) |

**Per module at the approved ref:** `config.py` 251 · `store.py` 457 · `budget.py` 637 · `providers.py` 173 · `receiver.py` 389 · `follow_up.py` 335 · `tier.py` 140.

## WHAT THE THREE REVIEW ROUNDS CHANGED — the load-bearing list

⛔ **Every hunk quoted below the line is from the r1 submission and several are now WRONG AS CODE.** The shed decision, the burn projection and the tombstone-cache block were all rewritten. What replaced them:

1. **The production path never charged a birth** — the ledger sat at zero for the 776k leg, so both burn thresholds were unreachable. Receiver now journals; the locked job folds.
2. **The ledger cost 198 ms per observation** and scaled with the *birth* rate, invisible to every test because they ran on empty ledgers. Events aggregate by hour: **2.857 MB → 0.002 MB, 198 ms → 6.4 ms.**
3. **The burn monitor's "two projections" were one** — `peak ≥ trailing` identically, so it read `warning` under ordinary load. Peak now answers a bounded question; both legs demonstrably bind.
4. **The reserve did not fit its own derivation** — 776,000 was a 30-day figure that failed even there. Re-derived against the worst month: **803,000 / 190,000 / 7,000.**
5. **A month boundary re-folded the entire previous month**, then left its final hour unfolded. Per-month journals plus a drain that archives rather than re-charges.
6. **Past and late checkpoints were orphaned** on the write side, then on the read side. Misses recorded; unread buckets caught up, bounded and counted.
7. **`size_source` was computed, then dropped, then persisted with no reader.** Now tallied daily and warned on.
8. **Four documented "fixes" could be reverted with every check still passing.** `test_mutations.py` exists to make that impossible.

**Every one of 1-8 was found by a reviewer, not by me.**

---

# ⬇ THE r1 SUBMISSION, PRESERVED — SUPERSEDED, NOT DELETED


**Owner:** CC-INFRA · **2026-08-28** · **change-class:** `non_architecture`
**READY AT:** `origin/migration/aws-supabase`, code landed `bdb688284` and `5643f40a1`.
**Upstream gates:** Step-1 APPROVED (3 conditions discharged) · Step-2 APPROVED at `77c82f67b` (3 blockers discharged in `PART F`/`PART G`).

**ALL FILES ARE NEW. NOTHING MODIFIED, NOTHING DELETED. ZERO live-path files in this diff** — the Phase-4 page is not built and is not in scope here.
⛔ **Untracked cross-check run (`git status --porcelain | grep '^??'`): none.** The change set is complete — that check exists because `git diff HEAD` omits untracked files and says nothing about the omission.

| file | lines | what it is |
|---|---|---|
| `token-watch/config.py` | 178 | every number, each traced to the pre-registration or scope |
| `token-watch/store.py` | 341 | append-only store; the §9.5(a) census answered in its header |
| `token-watch/budget.py` | 216 | reserve, shed order, burn monitor |
| `token-watch/providers.py` | 173 | **the only module that reaches the network** |
| `token-watch/receiver.py` | 237 | birth receiver; the only writer of census records |
| `token-watch/follow_up.py` | 145 | hourly checkpoint sweep |
| `token-watch/tier.py` | 140 | the only deleter |
| `token-watch/tests/*` | 449 | 57 checks, every block positive-controlled |
| `token-watch/systemd/*` | 5 units | receiver + hourly follow-up + daily tiering |
| `token-watch/README.md` | — | the decisions and the honest limits |

---

## THE LOAD-BEARING HUNKS

### 1. THE SHED DECISION — `budget.py`

```python
def allowed(kind, now=None):
    now = now or datetime.now(UTC)
    if kind in NEVER_SHED:            # NEVER_SHED = ("birth",)
        return True                   # ← no threshold anywhere on this path
    total = spent_total(now)
    headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED
    if kind == "liquidity":
        return spent_by("liquidity", now) < LIQUIDITY_AUDIT_CARVE and \
               total < headroom + BIRTHS_RESERVED
    if kind == "follow_up":
        return total < MONTHLY_CREDIT_CAP
    return True
```
**Verified by injection, not by waiting** (your Step-1 condition). The suite drives spend past the carve, then past the entire monthly cap; liquidity sheds first, follow-ups second, **births return True in both states.**

### 2. THE BURN PROJECTION — `budget.py`, and a defect a control caught

```python
def _rate_per_hour(events, since, until):
    hours = max((until - since).total_seconds() / 3600.0, 1e-9)
    lo, hi = since.isoformat(), until.isoformat()
    spend = sum(e["n"] * CREDITS[e["kind"]] for e in events if lo <= e["ts"] < hi)
    return spend / hours
```
**BEFORE:** `lo <= e["ts"] <= hi` — inclusive at both ends, so an event on a bucket boundary counted **twice**, doubling the apparent peak on a perfectly flat series and making the peak leg bind with no spike present. ⚠️ **It failed SAFE (alarmed early), which is why it would have survived review.** Caught by the flat-series control.

### 3. DEATH CLASSIFICATION REFUSES TO GUESS — `follow_up.py`

```python
if state.get("evidence") == "no_pairs_returned":
    # no-pairs is what a PULLED POOL looks like AND what an INDEXING GAP
    # looks like — indistinguishable from here.
    return "liquidity_pulled" if previous and previous.get("pairs") else None
```
A `None` leaves the token **in the schedule**: a wrongly tombstoned token is never re-checked, which is unrecoverable, so ambiguity costs one more observation rather than a record.

### 4. THE ONLY DELETER CANNOT REACH A BIRTH — `tier.py`

```python
NEVER_TOUCH = ("births", "observations", "dead")

def _safe(path):
    parts = os.path.normpath(path).replace("\\", "/").split("/")
    return not any(p in NEVER_TOUCH for p in parts)
```
The test writes a birth file **older than every window** and asserts it survives, with controls proving a fresh payload is left alone and an aged one is moved.

### 5. A SKIPPED CYCLE IS VISIBLE — `store.py`

```python
with periodic_lock("follow_up") as held:
    if not held:
        LOG.warning("another periodic job holds the lock — cycle SKIPPED, not performed")
        stats["skipped"] = True
        return stats
```
`periodic_lock` **yields False rather than raising**: *"could not get the lock"* and *"did the work"* must never be the same code path, or a permanently stuck lock reads as a quiet market.

### 6. THE SCALING DEFECT I FOUND IN MY OWN PRE-DISPATCH PASS — `store.py`

```python
if _DEAD_CACHE["mtime"] is not None:
    _DEAD_CACHE["set"].add(mint)
    try:
        _DEAD_CACHE["mtime"] = os.path.getmtime(tombstone_path())
    except OSError:
        _DEAD_CACHE["mtime"] = None      # fall back to a re-read; never guess
```
**MEASURED BEFORE FIXING:** `dead_set()` caches on the tombstone file's mtime; `record_death` changes that mtime, so the next due-queue lookup re-parsed the **whole** file. At day 90 that file holds **~376,000 entries** and a busy hour records **~520 deaths** ⇒ **~196 million line re-parses in one hourly run.** The hourly job stops finishing inside its hour around month three, **and it would have presented as a slow provider rather than as our own data structure.** Unit `MemoryMax` also raised 256M → 512M on a measured **~73 MB** resident set (~195 B/entry, measured).

---

## ⛔ THE JUDGEMENT CALLS I WANT ATTACKED

**1. `PLATFORM_DEFAULT_SIZE = 1.0` IS MINE, NOT THE LITERATURE'S — and it is the weakest thing in this diff.**
The pre-registration defines a trait carrier as *"any advertised channel OR initial size above the platform default."* The channels are observable. **The default is a number I assumed.** It sets the carrier/non-carrier split, therefore the follow-up population, therefore the cost model and the H2 replication. ⚠️ **Your own reasoning for importing thresholds was that a threshold set before our cohort existed cannot have been fitted to it — this one was set before our cohort existed but by ME, which buys none of that.** I would rather be told to measure it from the first day's births and amend than ship it silently.

**2. The `no_pairs` rule under-counts `liquidity_pulled`, systematically and in one direction.**
A token whose **first** observation already shows no pairs can never be classed as pulled, because there is no prior sighting. Those are disproportionately the fastest rugs — the class we most want to characterise. **A known, one-directional bias in a primary outcome.** My position: recording it as unclassified is honest and the 1h checkpoint limits the exposure. **I am not confident that is right.**

**3. The receiver answers 200 on a per-event failure.**
Trades duplicate risk for retry-storm safety on a 2-core box; records are append-only so a duplicate is visible rather than corrupting. **But it means a systematic parse failure returns 200 forever and looks healthy** — and the coverage control that would catch it is not built yet.

**4. A shed is recorded as an observation with `observed: False`.**
It keeps "did not happen" distinguishable from "happened and found nothing", but it puts non-observations in the observation stream. **Is that the right shape for the analysis, or should they be a separate stream?**

**5. The due queue duplicates.** Seven due-entries per followed token, filtered at read time against tombstones, buckets never rewritten. Bought: whole-store append-only, and the hourly job opens one small file instead of scanning ~1.86M rows. **Cost: entries for dead tokens are written and never removed until the bucket ages out.**

---

## WHAT IS DELIBERATELY NOT BUILT

⛔ **The coverage control (OBJ-3).** `providers.chain_creations()` raises `NotImplementedError` **and no timer ships for it.** It needs the enhanced-transaction paging semantics verified against live data, and inventing them from documentation is how a control ends up confirming what it never measured. **A coverage control sitting in the service listing that never measures anything is worse than an absent one.** Lands in the Phase-3 proving run (`P3.1`).

## `REVIEWER:` — THE FRESH-CONTEXT LOOP DID **NOT** RUN

⚠️ **Recorded as a denominator entry rather than glossed.** This session's harness configuration forbids spawning subagents unless Kyle requests one, which **conflicts with the standing approval in the step skills.** ⇒ **no `REVIEWER:` rounds for this dispatch.** The pre-dispatch pass was mine, against the objects at the ref — which found the §6 scaling defect, and is **not** the same instrument. **Flagged to Kyle: a mechanism written into four skills cannot fire in this session, which is exactly the "reads as covered" failure it was built to prevent.**

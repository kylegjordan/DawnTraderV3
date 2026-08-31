"""
token-watch — THE SOCIALS CHECK AND PROMOTION SWEEP. (#973)

★ WHY IT EXISTS: the trait definition is *"any advertised channel OR initial
  size above the platform default."* The webhook's creation event carries NO
  social fields at all — measured on 116 real launches, zero had any, and both
  branches `receiver.parse_creation` reads are empty on every real payload. So
  the socials half of the definition was structurally dead and the study had
  silently degraded to size-only.

★ THE FIX COSTS NOTHING, and that is why the design is this shape rather than a
  rationed one. Kyle asked which tokens we could afford to look up. The answer
  turned out to be ALL of them: the follow-up provider we ALREADY call, for
  free, returns the channels in its `info` block — verified on a 12-minute-old
  token of exactly the age we would check. ~43k requests/day against a 432k/day
  ceiling, and ZERO provider credits.

⛔ WHY AT THE HOURLY SWEEP AND NOT AT BIRTH (Kyle's ruling): the follow decision
   is made the instant a launch arrives, and adding a network call to the path
   that must keep up with ~24,000 launches/day risks the one thing that must
   never fall behind — RECORDING. The first checkpoint is not until age 1h, so
   a token promoted within the hour loses at most its 1h observation, and that
   loss is RECORDED AS A MISS rather than hidden.

⛔⛔ THE ARM IS ASSIGNED HERE, ONCE, FROM COMPLETE INFORMATION — AND THAT IS
   KYLE'S DESIGN, NOT THE ONE I PROPOSED (2026-08-31).

   I was going to draw the control at BIRTH and RECLASSIFY any token later
   found to have a channel. He asked why we assign it before we know. Do not
   make the wrong assignment and then correct it — do not make it yet. A
   logged reclassification is honest and still an artifact a reviewer is right
   to distrust; a single assignment made once has nothing to explain.

   THE CONTAMINATION IT REMOVES: drawn at birth, the control came from "not
   big enough" — because at birth SIZE is the only knowable fact — which is
   NOT the same set as "not a carrier". A control token later found to have a
   channel was A CARRIER SITTING INSIDE THE COMPARISON GROUP, biasing every
   rate the study reports, quietly.

   ⇒ at birth a non-carrier is `deferred`, in no arm at all. HERE, with both
     facts known, it becomes a carrier, or is drawn into the control from
     CONFIRMED non-carriers — the population the control was always meant to
     sample. Nothing is ever moved afterwards, and a resolved token is never
     re-examined.

⛔ THE CENSUS IS APPEND-ONLY AND IS NOT REWRITTEN. A promotion is a NEW record
   joined to the birth on `mint`. Editing the birth row would destroy the
   evidence of what we believed at the time, which is the one thing a
   left-truncation study cannot afford to lose.

⚠️ AND EVERY CHECK IS RECORDED, NOT ONLY THE PROMOTIONS. "Checked, no channels"
   and "never checked" are different facts, and a store that only holds the
   hits cannot tell them apart — the absent-as-valid failure this batch has now
   paid for five times.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import providers
from receiver import in_control_sample
from config import BIRTHS_DIR, ROOT
from store import _append, load_state, save_state, schedule_grid

UTC = timezone.utc
LOG = logging.getLogger("token-watch.promote")

# IN A 0700 SUBDIRECTORY, NOT AT THE STORE ROOT. The root is 0751 so the
#    app's user can TRAVERSE to `public/`; a file sitting directly in it had
#    its own 0600 as the ONLY control between it and that user, in the one
#    directory where `others` can traverse and where the umask had already
#    drifted once (Langston, 2026-08-31). Every other study file was already
#    behind a 0700 directory. Moving this one leaves NO regular file at the
#    store root, so traversal reaches nothing but the published summary.
CHECKS_PATH = f"{ROOT}/study/social-checks.jsonl"
CORRECTIONS_PATH = f"{ROOT}/provenance/mint-corrections.jsonl"
STATE = "promote"

# ⛔ A BOUND, so one run cannot become unbounded work on the box that also runs
#    live trading. ~24,000 launches/day is ~1,000/hour, of which ~68% are
#    non-carriers ⇒ ~680/hour. 1,500 leaves headroom for a catch-up after an
#    outage without letting a long backlog run away in a single pass.
MAX_CHECKS_PER_RUN = 1500

# A LOOKUP THAT RESOLVED NOTHING IS RETRIED, NOT GUESSED (Langston, BLOCKER-A).
# A no-pair answer is what an INDEXING GAP looks like as well as a dead token,
# and the provider's own indexing latency is UNMEASURED (A2.2) -- so treating it
# as "confirmed no channels" hangs the arm assignment on an unmeasured quantity,
# in the ADVERSE direction: no-pairs correlates with dying fast, which is the
# outcome under study. After this many attempts the token is assigned
# `unresolved` -- an arm that is NEITHER carrier NOR control, so it can never
# contaminate the comparison group, and it is excludable by name.
MAX_RESOLUTION_ATTEMPTS = 3



def _now() -> datetime:
    return datetime.now(UTC)


def _birth_files() -> list:
    if not os.path.isdir(BIRTHS_DIR):
        return []
    return sorted(f for f in os.listdir(BIRTHS_DIR) if f.endswith(".jsonl"))


def _read_new(path: str, offset: int):
    """Complete lines from `offset`, WITH each row's byte length.

    ⛔ THE BYTE LENGTHS ARE NOT BOOKKEEPING — THEY ARE THE SHED FIX. The first
       version advanced the cursor to the end of everything it READ, then did
       the lookups. A shed part-way through therefore skipped every remaining
       row FOR EVER: the cursor had already moved past them. Returning per-row
       sizes lets the caller advance to exactly the last row it PROCESSED, so a
       shed defers work instead of discarding it. Caught by the suite, not by
       reading the code.
    """
    if not os.path.exists(path):
        return [], [], offset
    size = os.path.getsize(path)
    if size < offset:
        LOG.error("promote: %s shrank (%d -> %d) — cursor restarted", path, offset, size)
        offset = 0
    if size == offset:
        return [], [], offset
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        raw = fh.read()
    if not raw:
        return [], [], offset
    if not raw.endswith("\n"):
        cut = raw.rfind("\n")
        if cut < 0:
            return [], [], offset
        raw = raw[: cut + 1]
    rows, sizes = [], []
    for line in raw.splitlines(keepends=True):
        nbytes = len(line.encode("utf-8"))
        body = line.strip()
        if not body:
            # a blank line is still consumed, or the cursor would stick on it
            if rows:
                sizes[-1] += nbytes
            else:
                offset += nbytes
            continue
        try:
            rows.append(json.loads(body))
            sizes.append(nbytes)
        except ValueError:
            if rows:
                sizes[-1] += nbytes
            else:
                offset += nbytes
    return rows, sizes, offset


def _correction_key(recorded_mint, created_at):
    """The composite key BLOCKER-D needed, and the mint alone could not be.

    ⛔ `recorded_mint` ALONE IS NOT A KEY. It is USDC on every collapse, so
       nineteen corrections reduced to a dict of ONE and every collapsed birth
       was substituted to the SAME mint -- reproducing, inside the fix, the
       exact one-identity-for-many-launches defect BLOCKER-C was filed for.

    ⛔⛔ AND THE ROOT CAUSE WAS WORSE THAN "the reader joined on the wrong
       field". The corrections carried a `signature` "so they would join to the
       birth row" -- and THE BIRTH ROW HAD NO SIGNATURE. The join was
       impossible, so the reader fell back to the only shared field, which was
       the collapsed mint. **A key written on ONE side of a join is not a key.**
       Births now carry `signature`; this composite exists for the rows written
       before that field did.

    ⇒ `(recorded_mint, created_at)` is unique per launch -- two collapses would
      have to share a creation instant to collide, and that case REFUSES rather
      than guessing.
    """
    return (recorded_mint, created_at)


def _mint_corrections() -> dict:
    """BLOCKER-C's repair store, keyed so it can actually be applied.

    ⛔ WHY THE SWEEP HAS TO KNOW ABOUT THIS AT ALL. The census is APPEND-ONLY,
       so births written before the conservation fix still carry the collapsed
       mint. A sweep reading them at face value would look up USDC -- whose
       channels always resolve -- and route it to the TREATMENT arm, recreating
       the contamination the fix removed. A correction that is RECORDED rather
       than rewritten must be applied by every READER.

    ⛔⛔ AN AMBIGUOUS KEY REFUSES RATHER THAN GUESSING. If two corrections share
       a key and disagree, the mapping is DROPPED and logged: substituting the
       wrong real token is worse than leaving the collapse visible, because the
       collapse is detectable and a wrong substitution is not.
    """
    out, seen = {}, set()
    if not os.path.exists(CORRECTIONS_PATH):
        return out
    try:
        with open(CORRECTIONS_PATH, encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                rec, cor = r.get("recorded_mint"), r.get("corrected_mint")
                created = r.get("created_at")
                if not (rec and cor and created) or rec == cor:
                    continue
                k = _correction_key(rec, created)
                if k in seen and out.get(k) != cor:
                    LOG.error("ambiguous mint correction for %s -- DROPPED "
                              "rather than guessed", k)
                    out.pop(k, None)
                    continue
                seen.add(k)
                out[k] = cor
    except OSError as exc:
        LOG.error("could not read mint corrections (%s) -- collapsed mints will "
                  "be swept at face value", exc)
    return out


def _has_channel(socials: dict) -> bool:
    return any(bool(v) for v in (socials or {}).values())


def run(now: datetime = None) -> dict:
    """One socials pass over births not yet checked.

    ⚠️ CALLED FROM INSIDE THE HOURLY JOB'S LOCK. It appends to the census
       directory's sibling stores and rewrites its own cursor state, and
       `store`'s rule is that every read-modify-write holds the lock.
    """
    now = now or _now()
    st = load_state(STATE, {})
    cursors = st.setdefault("cursors", {})
    tries = st.setdefault("attempts", {})   # mint -> unresolved lookups so far
    corrections = _mint_corrections()       # BLOCKER-C: recorded -> real
    stats = {"checked": 0, "with_channel": 0, "scheduled": 0,
             "control_drawn": 0, "errors": 0, "shed": False, "shed_reason": None,
             "bounded_out": 0, "unresolved_no_pairs": 0,
             "unresolved_error": 0, "resolution_exhausted": 0,
             "mint_corrected": 0}

    # ⛔ PROCESS FILE BY FILE, ADVANCING THE CURSOR TO THE LAST ROW ACTUALLY
    #    HANDLED. The first version advanced past everything it READ before
    #    doing any lookups, so a shed part-way through discarded the remainder
    #    permanently. A shed must DEFER work, never drop it.
    budget = MAX_CHECKS_PER_RUN
    stop = False
    for name in _birth_files():
        if stop or budget <= 0:
            break
        path = os.path.join(BIRTHS_DIR, name)
        rows, sizes, base = _read_new(path, cursors.get(name, 0))
        consumed = base
        for birth, nbytes in zip(rows, sizes):
            if budget <= 0:
                stats["bounded_out"] += 1
                continue
            recorded_mint = birth.get("mint")
            # BLOCKER-C: the birth row may carry a collapsed mint. Study the
            # token that actually launched, not the payment currency.
            mint = corrections.get(
                _correction_key(recorded_mint, birth.get("created_at")),
                recorded_mint)
            if mint != recorded_mint:
                stats["mint_corrected"] += 1
            reason = birth.get("follow_reason")
            # An existing carrier needs no lookup — its channels cannot change
            # what we already do with it. It still consumes its bytes.
            # ⛔ ONLY `deferred` TOKENS ARE RESOLVED HERE. A size-carrier was
            #    assigned at birth from a fact nothing later can change, and an
            #    already-resolved token must never be reconsidered — a second
            #    look is how an arm assignment starts moving again.
            if reason != "deferred" or not mint:
                consumed += nbytes
                continue
            # ⛔ PACING MOVED TO THE PROVIDER CHOKEPOINT, AND THE REASON IS THE
            #    COMMENT THAT USED TO SIT HERE. It recorded that THIS sweep hit
            #    429 on its first live run and was paced in response -- and the
            #    fix never travelled to the OBSERVATION sweep, which shares the
            #    same provider and the same ceiling and paced itself not at all.
            #    Two callers, one limit, two notions of the rate, neither aware
            #    of the other. `providers._get` now paces every call by host, so
            try:
                state = providers.token_state(mint)
            except providers.Shed as exc:
                # ⛔ STOP WITHOUT CONSUMING THIS ROW, so it is retried next hour.
                # ⛔⛔ AND NAME WHICH SHED IT WAS. The first live run reported
                #    `shed: True` with the budget at 0.4% of cap — because a
                #    429 from the provider and an exhausted credit budget both
                #    raised the same bare flag. Two different causes, one
                #    indistinguishable signal, which is this batch's most
                #    expensive recurring shape. They need different responses:
                #    a rate limit means slow down, an exhausted budget means
                #    stop until the month rolls.
                stats["shed"] = True
                stats["shed_reason"] = ("rate_limited"
                                        if "rate" in str(exc).lower()
                                        else "budget")
                stop = True
                break
            except Exception as exc:
                # BLOCKER-B. This used to log a counter and advance the cursor,
                # so the token stayed `deferred` in the census FOR EVER -- in no
                # arm, never scheduled, with no row saying why, and the only
                # trace an integer that cannot be joined to a mint. It
                # contradicted this module's own invariant 170 lines above it.
                # "Checked, and the check FAILED" is a THIRD state and it is now
                # recorded like the other two.
                stats["errors"] += 1
                attempts = int(tries.get(mint, 0)) + 1
                LOG.warning("socials lookup failed for %s (attempt %d): %s",
                            mint, attempts, exc)
                giving_up = attempts >= MAX_RESOLUTION_ATTEMPTS
                _append(CHECKS_PATH, {
                    "mint": mint,
                    "checked_at": now.isoformat(),
                    "socials": None,
                    "socials_status": "error",
                    "error": "%s: %s" % (type(exc).__name__, exc),
                    "attempts": attempts,
                    "had_channel": None,
                    "was": reason,
                    "becomes": "unresolved" if giving_up else "deferred",
                })
                if giving_up:
                    stats["resolution_exhausted"] += 1
                    tries.pop(mint, None)
                    consumed += nbytes      # abandoned, but ON THE RECORD
                else:
                    tries[mint] = attempts  # retried next sweep; cursor holds
                continue

            budget -= 1
            raw_socials = state.get("socials")
            # THREE STATES, NEVER TWO. resolved / no_pairs / error need
            # different answers, and collapsing them is the shape this batch has
            # now paid for four times.
            if raw_socials is None:
                status = "no_pairs"
                socials, found = {}, False
            else:
                status = "resolved"
                socials = raw_socials
                found = _has_channel(socials)
            stats["checked"] += 1

            age_s = None
            created = birth.get("created_at")
            if created:
                try:
                    age_s = round((now - datetime.fromisoformat(created)).total_seconds(), 1)
                except (ValueError, TypeError):
                    age_s = None

            attempts = int(tries.get(mint, 0)) + 1
            rec = {
                "mint": mint,
                "recorded_mint": recorded_mint if mint != recorded_mint else None,
                "checked_at": now.isoformat(),
                # THE AGE THE OBSERVATION WAS TAKEN AT. Without it this field
                # would read as "socials at launch", a stronger claim than the
                # data supports -- a token can add a channel on day three.
                "observed_at_age_s": age_s,
                "socials": socials if status == "resolved" else None,
                "socials_status": status,
                "attempts": attempts,
                "had_channel": found if status == "resolved" else None,
                "was": reason,
            }

            if status != "resolved":
                # UNRESOLVED: no arm is assigned. The token stays deferred and
                # is retried, because "we could not look" is not evidence of
                # anything. The record is written EITHER WAY -- that is
                # BLOCKER-B: a failed check is a third state and must not be
                # recorded as neither.
                stats["unresolved_" + status] += 1
                if attempts >= MAX_RESOLUTION_ATTEMPTS:
                    rec["becomes"] = "unresolved"
                    stats["resolution_exhausted"] += 1
                    tries.pop(mint, None)
                    consumed += nbytes          # give up, but ON THE RECORD
                else:
                    rec["becomes"] = "deferred"
                    tries[mint] = attempts
                    # DO NOT consume: it must come back on the next sweep.
                _append(CHECKS_PATH, rec)
                continue

            tries.pop(mint, None)
            # ONE ASSIGNMENT, MADE ONCE, FROM COMPLETE INFORMATION. Both facts
            # are now known -- size (at birth) and channels (just resolved) --
            # so the arm decided here is final.
            if found:
                stats["with_channel"] += 1
                arm = "trait_carrier"
            elif in_control_sample(mint):
                # DRAWN FROM CONFIRMED NON-CARRIERS -- and "confirmed" now means
                # the lookup actually RESOLVED, not merely that it returned
                # without raising.
                arm = "control_sample"
                stats["control_drawn"] += 1
            else:
                arm = "not_sampled"

            rec["becomes"] = arm
            if arm != "not_sampled":
                try:
                    schedule_grid(mint, datetime.fromisoformat(created))
                    stats["scheduled"] += 1
                except Exception as exc:
                    stats["errors"] += 1
                    LOG.warning("could not schedule %s (%s): %s", mint, arm, exc)

            _append(CHECKS_PATH, rec)
            consumed += nbytes

        cursors[name] = consumed

    st["cursors"] = cursors
    st["attempts"] = tries
    st["checked_at"] = now.isoformat()
    save_state(STATE, st)
    LOG.info("promote %s", stats)
    return stats

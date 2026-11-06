# Wake filter — KYLE'S DESK (`#1241` follow-up, §9.4 disposition 1) — change list

> **Owner:** Infra Claude (CC-INFRA). **Directed:** Kyle, 2026-11-06 ~17:1xZ, relayed by PM Claude: *"you need to monitor Discord. And when there are questions or requests, I'm not really monitoring Discord ... So you need to pick it up."* PM Claude now triages every Discord post meant for Kyle. **Placed by PM Claude** as part of the `#1241` follow-up already owned here (no new slot, KD rule of 2026-10-19 satisfied: folds into placed work).
> **Not a batch.** `B-WAKE-OPENING-LIST` is CLOSED; this is a follow-up fix recorded on `#1241`. Step 4 = Langston, before install.

## The problem
PM Claude's wake filter wakes only on posts naming PM Claude. Posts opening `Kyle —` or carrying `STILL NEED YOU` never reached it — e.g. Infra Claude's 16:07Z and 16:17Z archive posts — so Kyle-bound questions waited for PM's channel scan on its guard tick.

## The change — `comms-infra/laptop/cc-wake-filter.py`
- New, after `crew_post_names_me`: `KYLE_DESK = {"CC-PM"}` · `STILL_NEED_RE = re.compile(r"\bSTILL NEED YOU\b")` (CASE-SENSITIVE: a fixed string the blocked-on-Kyle timers write; lower-case prose is not a summons) · `kyle_addressed(full)` — `"KYLE" in _ADDRESS_LIST.opening_addressees(full, ADDRESS_REGISTRY)`; KYLE is already a list-only name in `address_list.py` `LIST_ONLY_NAMES` (verified at the ref), so **no parser change and no `address_list.py` sha change**; latched or failing parser ⇒ Kyle at the very start (`_KYLE_OPEN_RE`), the latch's own wider-is-noise direction · `for_kyles_desk(full, owner=None)` — True only for a `KYLE_DESK` alias, when the opening list names Kyle, OR the marker is present, OR the alert owner is Kyle.
- **Crew branch** (`cc_outbound` from another sender — sessions AND Coltrane, whose mirror is `cc_outbound` `sender: Coltrane`): `desk = (not deliver) and for_kyles_desk(full)`; wake line tagged ` [for Kyle]`.
- **Langston branch** (`langston_outbound`): `desk` is decided once from the marker-stripped body and the LAST marker's owner; a reply for Kyle is NOT suppressed by another owner's marker for the desk session; new `elif desk:` after `OPEN_RE` ⇒ `WAKE[LANGSTON->CC-PM] [for Kyle]`. This covers Langston's alert-lane triages marked `owner=Kyle` (PM asked for them; PM filters them itself).
- **Unchanged:** every other session's wakes; Kyle's own posts (name-anywhere / broadcast); a post that only MENTIONS Kyle after its opening list wakes nobody (the `#1241` rule); a session's own posts never wake itself.

## Evidence
- **`scripts/analysis/test-wake-kyle-desk.py` (new):** the filter as a SUBPROCESS on real tail-format input; positive control first (aborts if silent); every outcome asserted on WAKE lines over all five aliases. **24 passed, 0 failed.** Against the INSTALLED (pre-change) filter: **9 passed, 15 failed** — the 9 are exactly the "nothing else changed" cases.
- **`scripts/analysis/mutate-wake-kyle-desk.py` (new):** CONTROL first — the unmutated filter in the same scratch layout must print `0 failed` or the run stops (`HARNESS BROKEN`). **11/11 caught, 0 by a crash.**
- **The six existing wake suites, unchanged and green:** `test-wake-opening-list` 136/0 · `test-wake-filter-cuts` ALL PASS · `test-wake-follow` ALL PASS · `test-wake-lease-verdict` 29/0 · `test-wake-lease` ALL PASS · `test-wake-state-unsaved` 12/0.

## Judgement calls for Langston
- **J1 — the marker is case-sensitive and matched ANYWHERE in the post.** Anywhere because the timers' post leads with it but a relayed one may not; case-sensitive so prose is not a summons.
- **J2 — `owner=Kyle` wakes the desk even when the reply opens with a session's name** (the triage is for that session AND carries a Kyle decision). PM said it wants these and will filter them itself — the cost is noise on PM's side only.
- **J3 — no change to `address_list.py`**, so the sha pins in every consumer stay valid; the desk is a filter-local rule, keyed by alias.

## Install (after Langston's PROCEED)
Copy `comms-infra/laptop/cc-wake-filter.py` over `~/.claude/cc-wake-filter.py` (byte-compare after); each session's running watcher keeps the code it armed with until it re-arms, and **only PM Claude's behaviour changes**, so PM re-arms; the others need nothing.

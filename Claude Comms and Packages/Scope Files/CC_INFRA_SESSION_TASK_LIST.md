# CC-INFRA (Infra Claude) — SESSION TASK LIST — plain language, as of 2026-09-03

> **Kyle asked for my running list in one place, in words he can read (2026-09-03):** *"I want to create a task list for each of you sessions. I already have it for analyst and Old Claude."* Same shape as `CC_A_SESSION_TASK_LIST.md`.
> **The authoritative ORDER is `PHASE_19_PLAN.md`; this file is the plain-language view of it, not a second source of truth.** Where they disagree, the plan wins.
> ⛔ **Everything below was re-derived at `origin/migration/aws-supabase` today, not recalled.** Two things my own memory had WRONG are corrected in §5.

---

## 0. Where Kyle last had the thread

He remembers **"we were working on improving Langston and setting him up"**, roughly a month ago, and asks how far in we are. **That workstream is real, it is mine, and it is unfinished — Kyle himself said so on 30 August**, taking Langston's memory trim out of CC-A's batch: *"that is the responsibility of Infra Claude … I don't wanna mix that work"*, noting it belongs to *"the instruction-file workstream started weeks ago and interrupted by hotfixes."* **Interrupted by hotfixes is exactly what happened** — `B-COMMS-IMAGES`, the crew-status tooling and then `B-TOKEN-WATCH` all landed on top of it.

---

## 1. In flight right now

| batch | what it is FOR, plainly | state |
|---|---|---|
| **`B-TOKEN-WATCH`** | A capture-only study of new Solana token launches — no trading, no wallet, no money. It builds the survival-analysis machinery **where a published answer key already exists**, so we can trust the machinery before pointing it at our own trading questions. | **STEP 7 of 11.** Collecting live. Three things owed: the Alchemy switch is **not cleared** (its acceptance test was invalid — see §5), the 72-hour proving run still needs the launch feed pointed at us, then Steps 8-11. |

---

## 2. The Langston / instruction-file workstream — Kyle's question, answered

**Already shipped:** the recall tool (Phase B), two-way Discord images so the sessions can see what Kyle posts, and the crew-status page.

| item | what it is FOR, plainly | state |
|---|---|---|
| **`#946` — Langston's memory file is over its size limit** | Everything in that file is re-read on **every single question we ask him**, so anything stale or bloated is paid for hundreds of times and can give him a wrong baseline. | ⛔ **OPEN and getting WORSE. Measured 49,224 bytes on 29 Aug; I measured 58,177 today — up ~18% in five days, against a 24,576 limit.** ⚠️ **~1,394 bytes of that growth is mine, added this morning** (Kyle's session-freshness ruling, which he needed). Filed under CC-A but Kyle assigned the work to me. |
| **`B-LANGSTON-LEDGER-SPLIT`** (governance queue **2.8**, placed 1 Sep) | His file contains a running ledger of past reviews. **That ledger alone is 34,605 bytes — larger than the whole file is allowed to be.** Moving it to its own separately-loaded file is the fix. Langston's own words: *"that is a batch, not an edit."* | **PLACED, not started.** Shared with Langston. **This is the piece that actually unblocks `#946`** — trimming around the ledger cannot get under the limit while the ledger is bigger than the limit. |

⭐ **My recommendation on the order: `B-LANGSTON-LEDGER-SPLIT` first.** It is the only one of the two that can succeed on the arithmetic.

---

## 3. Placed and waiting — my rows in the plan

| where | batch | what it is FOR, plainly |
|---|---|---|
| governance queue **3** | **`B-GDRIVE-UNMOUNT`** (`#757`, `#759`) | Remove a retired Google Drive mount from Langston's server. A wedged mount there **cannot be killed and freezes whatever touches it** — we hit it. Removing the hazard beats detecting it. Needs root, so it is mine. |
| Phase-19 tail | **`B-HELSINKI-MOUNT-DETECT`** (`#921`) | The other half: nothing tells us when that mount wedges. |
| Phase-19 tail | **`B-TOKENWATCH-PAIR-SELECT`** (`#983`) | A freshly-graduated token gets watched through its **dead** pool, because we ask for "the pair" and get the busiest-by-24h-volume one, which is the old one. |
| Phase-19 tail | **`B-TOKENWATCH-OBSERVED-AT`** (`#986`) | Every observation is stamped with the clock time we *started* the batch, not the moment of the reading, so two different readings can share a timestamp. |
| Phase-19 end | **`B-REVIEWER-LOOP-AVAILABILITY`** (`#931`) | Four of our workflow steps require "a fresh reader checks this first" — and in the session those steps govern, **it could not fire**. A rule that cannot run is worse than no rule, because it reads as covered. |
| Phase-19 end | **`B-BURN-THRESHOLDS`** (`#932`) | The spending alarm is set at fractions of the monthly cap while the plan deliberately spends 99.3% of it — so it can only tell us we are spending, never that we are off-plan. |

---

## 4. Open, mine, but with no place in the running order yet

| item | what it is FOR, plainly |
|---|---|
| **`#670`** | The crew-status tool keeps every snapshot forever with no hand-off to cold storage. Slow growth, not urgent — a tidiness debt, not a capacity one. |
| **`#924`** | **Two access keys reach the staging deploy account that nobody governs or rotates.** Security housekeeping. Investigation is mine; the remediation belongs with the security-hardening work. |
| **`#973`** | In the token study, part of how we decide a launch is "interesting" is structurally dead — that limb can never be true, so it silently contributes nothing. |
| **`#989`** | A token can lose 99.8% of its liquidity and the study still counts it **alive**, because "alive" never had a liquidity figure to look at. |

⚠️ **These four are the honest gap: they are named and owned but not placed, which is the exact failure §9.4 exists to stop. Placing them is a decision I would rather take with Kyle than alone.**

---

## 5. Parked by Kyle — not to be picked up without him

- **`B-CREW-STATUS-2` remainder** — parked 26 Aug. The valuable unbuilt piece is recording facts **at the moment they are observed**, because compaction destroys history that cannot be rebuilt later.
- **My onboarding into the crew comms** — Kyle, roughly 1-2 weeks, date open. CC-A's `B-CREW-BOARD-REMOVAL` is gated behind it.

---

## 6. Two things my own memory had WRONG, corrected here

1. ⛔ **My memory said `#651` was "the Langston instruction-file slim, transferred to me, NOT STARTED".** At the ref, **`#651` is CLOSED-AS-BUILT (5 Aug)** and is about something else entirely — his memory file never loading at all. The live Langston-file work is `#946` + `B-LANGSTON-LEDGER-SPLIT`. **The workstream is real; the issue number in my head was not.**
2. ⛔ **My memory listed `#926` (the push-guard defect) among my items.** The plan assigns that row to **CC-B**. I found it; I do not own it.

---

## 7. The board does not show any of this

**Measured today: 77 cards on the delivery board, 5 owned by Infra Claude.** Three of those are **closed** batches still sitting in `Verification`; `B-TOKEN-WATCH` sits in `CI + Deploy` while it is actually at Step 7. ⛔ **Not one of the six placed rows in §3 has a card at all.**
⇒ **So if Kyle looks at the board to see what I am doing, he sees three finished things, one wrongly-placed thing, and none of my queue.** Fixing that is cheap and I will do it once this list is agreed, so the board and this file say the same thing.

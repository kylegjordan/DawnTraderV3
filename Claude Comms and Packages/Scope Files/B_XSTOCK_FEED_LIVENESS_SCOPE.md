# B-XSTOCK-FEED-LIVENESS — Step-1 scope (#594)

**change-class: `non_architecture`**
**Owner:** CC-B (verified in `RUNNING_ISSUES.md` #594, not taken from a Discord hand-off) · **Date:** 2026-07-30
**Sequence:** Kyle-ordered immediately after #605. **Hard prerequisite for xStock active-fill enablement** (Langston-ruled) — the fill path leans on this watchdog, so this lands *before* activation, not with it.

---

## 1. ★ PROVENANCE READ (§2 1.b + rule 24.0) — AND IT CHANGES THE FIX

**Corpora searched, named per Langston's evidence standard:** `git log -S "lastMsgAt" --reverse` **unrestricted by path** (survives the P19-B-RENAME `active-*` family rename); `RUNNING_ISSUES.md`; `BATCH_CATALOG.md`; the batch's own alert history. **`bridge/canonical/` NOT applicable and that is recorded** — the archiver postdates the 2026-01/02 governance change.

**Origin, quoted verbatim rather than summarised (#452):**
- **`ce4a7e408`, 2026-05-01 — *"B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)"*** — introduces `lastMsgAt`.
- **`882305784`, 2026-05-25 — *"B-NEW-44: xStock equity-spot WS diagnostic observability (1-chunk)"*** — the diagnostic layer.
- The stall watchdog arrives later still, at **P19-B4a C3** (June).

★★ **THE DECISIVE MEASUREMENT: AT INTRODUCTION, `lastMsgAt` HAD EXACTLY TWO CONSUMERS, AND NEITHER WAS A WATCHDOG.**
At `ce4a7e408` the only occurrences are `:118` (type), `:128` (init), **`:175` (stamped on message receipt)** and **`:239` (`lastMsgAge`, read by the health/diagnostic log line)**. **`git show ce4a7e408 | grep -c "runStallWatchdogTick"` = 0.**

⇒ **ORIGINAL INTENT: `lastMsgAt` answers *"is this socket still talking?"* — a CONNECTION-liveness question, for an observability log line.** ⇒ **Stamping it on ANY frame — acks, status, heartbeats — is CORRECT for that purpose. A heartbeat genuinely does prove the socket is alive.**
⇒ **The watchdog (P19-B4a C3) later attached a SECOND consumer with DIFFERENT semantics — *"are PRICES still arriving?"* — to a field built for the first question.**

★ **DISPOSITION — rule 24 outcome (3) / §2 1.b disposition (2): relevant, but needing an update to today's intent.** The field is **not broken** and is **still correctly serving its original consumer** (the health log at `:273`). **The defect is the second attachment, not the field.**

★★ **AND THE STRONGEST FACT IN THIS BATCH — THE THRESHOLDS WERE CALIBRATED AGAINST THE *DATA* CLOCK FROM DAY ONE, WHILE THE WATCHDOG HAS READ THE *ANY-FRAME* CLOCK SINCE C3 (Langston, at the ref).** `drizzle/migrations/2026-06-14-p19-b4a-c3-xstock-fill-safety-seed.sql:12-13`, **verbatim**:
- `stall_reconnect_ms_rth = 75000 -- above RTH p99.9 **inter-tick** 28.7s w/ margin`
- `stall_reconnect_ms_offrth = 750000 -- above off-RTH p99 **inter-tick** 192s w/ margin`
**Population on record: the Fri 2026-06-12 session, ~7.9M ticks / 485 symbols** (`BATCH_CATALOG.md:358`).
⇒ ★ **“INTER-TICK” IS THE DATA POPULATION. The watchdog thresholds an any-frame clock against constants derived from tick arrivals — so the numbers and the measurement have NEVER referred to the same thing.** ⇒ **this is a SECOND, INDEPENDENT statement of the same mis-wiring**, arrived at from the calibration side rather than the provenance side. ⇒ ★ **AND IT SETTLES THE QUESTION STEP-4 WOULD OTHERWISE ASK — *“were these thresholds measured against the clock you're deleting?”* — NO. They were measured against the clock we are ADDING. **The thresholds need NO re-derivation; pointing the watchdog at `lastDataMsgAt` makes the constants CORRECT for the first time.**

✅ **AND THE ONE ITEM CC-B FLAGGED AS UNREAD IS SETTLED — no Step-3 time to be spent on it (Langston):** age and threshold are computed on **independent lines** — `inLiquid = isXstockLiquidFillWindowET(…)` → `threshold = inLiquid ? stallReconnectMsRth : stallReconnectMsOffrth`. ⇒ **“thread through the same selection” costs exactly ONE IDENTIFIER on the age line; the selection block is untouched. No hazard, no reshaping.**

⚠️ **AND THIS IS WHY THE READ EARNED ITS COST — THE OBVIOUS FIX WOULD HAVE BROKEN THE ORIGINAL CONSUMER.** The instinctive repair is *"move the stamp into the parsers so it only fires on data."* **That would silently invert the health log's meaning:** a chattering-but-dataless socket would start reporting as stale, and the one line whose job is connection-liveness would stop answering connection-liveness. **Nothing would throw. No test would fail.** ⇒ **a code-only reading of this defect points at the wrong repair.**

---

## 2. Objectives

**OBJ-1 — add a SEPARATE data-liveness clock; do NOT move the existing stamp.**
New monotonic `lastDataMsgAt`, stamped **only** inside `parseOhlcBar` / `parseTickerSnap` — i.e. only where a PRICE actually arrived, ★ **and placed AFTER `if (!data?.symbol) return;` (Langston): a MALFORMED SNAP MUST NOT COUNT AS DATA LIVENESS.** ⚠ **AND `_setArchiverStateForTest`'s `Partial<Pick<ArchiverState, …>>` must gain the new field, or the fences cannot set it.** `runStallWatchdogTick` (`:334-364`) thresholds on **`lastDataMsgAt`**, exactly as it thresholds `lastMsgAt` today (`:341`).
⛔⛔ **BLOCKER FIXED (Langston Step-1) — OBJ-1 AS FIRST WRITTEN WOULD HAVE TURNED A QUIET PERIOD INTO A RECONNECT LOOP ON THE LIVE MARKS FEED.**
`runStallWatchdogTick` reads `const ageMs = state.lastMsgAt > 0 ? Date.now() - state.lastMsgAt : Infinity`. **Today that `Infinity` sentinel is nearly unreachable**, because `handleMessage` stamps on **any** frame and the subscribe-ack lands milliseconds after open. **Repoint the threshold at `lastDataMsgAt` and "never yet had a price" becomes `ageMs = Infinity`, unconditionally `> threshold`.**
⇒ **boot or reconnect OFF-RTH · socket OPEN · `reconnectPending` false · no tick for one check interval ⇒ CRITICAL alert + forced `ws.close()` + reconnect + repeat.** The off-RTH threshold sits **above a measured p99 of 192s** — gaps that long are EXPECTED — and the forced close drops **the only venue price source for xStock marks**. ⚠ **`dedupe_key` caps the ALERT noise, not the CHURN.**
★ **THE DEFECT IN ONE LINE (Langston): *"never had data" and "had data, then stopped" are different states, and the scope collapsed them.***
⇒ **REQUIRED, STATED NOT LEFT TO IMPLEMENTATION INSTINCT: seed `lastDataMsgAt` at CONNECT-OPEN** (mirroring how `lastMsgAt` is de-facto seeded by the ack today), **so an unset field can never read as infinitely stale.**
⇒ **REQUIRED FENCE: boot-with-no-ticks — socket open, zero data frames, one check interval elapsed ⇒ ASSERT SILENCE (no `[STALL]`, no forced close).** Must FAIL if the seed is removed.

★ **`lastMsgAt` KEEPS its current stamping site (`:202`, first line of `handleMessage`) and KEEPS feeding the health log (`:273`)** — per §1, that is correct behaviour for its own question, and preserving it is a requirement rather than an oversight.

**OBJ-2 — ❌ do NOT threshold on `rowsPersistedLastMinute` (Langston-ruled; the obvious option is wrong).** That counter (`:43`) is **windowed and zeroed by the 60s health log at `:278`, on a different timer from `STALL_WATCHDOG_CHECK_MS`** ⇒ a watchdog tick landing just after a reset reads 0 on a healthy feed. **That trades a blind detector for a flapping one**, and a flapping detector gets muted, which is strictly worse.

**OBJ-3 — FENCE TEST, and it must fail before it passes.** Simulate **chatter-only frames** (subscribe-acks / status, no data) and **assert `[STALL]` FIRES**. ★ **Mutation-proof it:** with the fix reverted the test must FAIL. *(A repaired self-check that always passes is worse than one that always fails, because only the second gets investigated.)*

**OBJ-4 — preserve the weekend guard.** `:335` `if (isInXstockWeekendClose(now)) return;` stays untouched. The watchdog is asleep by design across the Fri-20:00→Sun-20:00 ET close (`market-hours.ts:79`), and xStocks trade **24/5, not US RTH** (rule 17).

## 3. Explicitly OUT of scope
- ❌ **The exit-skip alert family itself** (#583/#531 — trading-window + exit policy, CC-C). **Langston-ruled: burying a detector defect inside a policy batch is how it gets deferred behind the policy debate.**
- ❌ **`crypto-spot-archiver.ts:148` and `equity-perp-archiver.ts:165`**, which stamp the same way. **Neither has a watchdog, so neither has a defect** — noted so a later grep doesn't read as a missed sweep, and flagged because **any watchdog added there later inherits the trap.**
- ❌ ★ **SNAP-ARRIVAL ≠ MARK-FRESHNESS — named and homed so nobody later “fixes” the stamp by moving it (Langston).** The mark write is **conditional** (`Number.isFinite(_mark) && _mark > 0`); the `!data?.symbol` guard is **not**. ⇒ **a snap can pass the guard, be archived, and write NO mark — so `lastDataMsgAt` reads FRESH while `latestEquityTick` ages.** ⚠ **THE PLACEMENT IN THIS BATCH IS STILL CORRECT AND MUST NOT MOVE:** stamping inside the mark branch would make the two parsers inconsistent (`parseOhlcBar` has no mark at all). ★ **Stated as a MECHANISM CITED, NOT A FAILURE MEASURED** — needs its own §13 home rather than absorbing into this batch.
- ❌ **Self-closing alerts when a position closes** — Langston surfaced it on the same alert family (eight of nine open reminders describe already-closed positions). **Real, adjacent, and not this batch.** Needs its own §13 home.

## 4. Verification
- Unit: chatter-only → `[STALL]` fires; data-bearing → silent; **weekend window → silent even with zero data**; and `lastMsgAt`'s health-log value **unchanged** by the patch (the original-consumer regression fence).
- Live (§9.3): after deploy, confirm the health log still reports connection liveness **and** that a `[STALL]` can be provoked. ⚠️ **`grep '[STALL]'` across all retained out logs currently returns ZERO hits, ever** — so absence of `[STALL]` post-fix proves nothing on its own; the provoked case is the evidence.
- ⚠️ **Stdout retention is ~2 days (`out.log`, size-rotated); `console.warn` → `error.log` is ~14.** **Emit `[STALL]` on stderr** or the evidence evaporates before anyone asks.

## 5. Governance
Tier 1 per §3. **SIM: required** — the archiver gains a second liveness field, and cross-cutting runtime state is SIM-scope. **System Manual: not applicable** (no architecture/strategy/regime/math change). #594 updated at close; the two flagged-not-scoped items (#583 family self-close, sibling archivers) carry §13 pointers.

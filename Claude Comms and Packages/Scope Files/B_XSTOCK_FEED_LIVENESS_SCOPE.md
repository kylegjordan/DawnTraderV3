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
⛔ **CORRECTED (Langston Step-4) — THE CLAIM ABOVE WAS WRONG ON POPULATION, AND IT WAS THIS BATCH'S ONE LOAD-BEARING CLAIM.** The seeded thresholds are **PER-SYMBOL successive `captured_at` diffs** (freshness doc §3; n=**6.00M** RTH / **1.15M** off-RTH). **`lastDataMsgAt` is UNIVERSE-WIDE** — stamped once per symbol-tick across **~485 symbols** ⇒ at ~900K-996K ticks/hr the aggregate inter-arrival is **~4ms against a 75s threshold**. ⇒ **DIFFERENT POPULATIONS, ~4 ORDERS OF MAGNITUDE APART. The constants were NOT “derived against this clock all along.”** ★ **THE SAFE VERSION IS TRUE AND CHECKABLE, AND IS WHAT THE BATCH NOW CLAIMS: the aggregate clock is STRICTLY DENSER than the per-symbol clock the numbers came from ⇒ THIS CHANGE CANNOT MAKE THE WATCHDOG FIRE MORE OFTEN THAN BEFORE.** ⇒ **the thresholds are NOT re-derived, and the watchdog detects a TOTAL FEED STALL ONLY.** ⚠ **Partial-stall blindness (one symbol dark, 484 alive ⇒ clock reads fresh) + aggregate-clock calibration are rule-24 outcome (2) — working-as-designed-but-unaddressed, a SCOPE DECISION — homed at #635.**
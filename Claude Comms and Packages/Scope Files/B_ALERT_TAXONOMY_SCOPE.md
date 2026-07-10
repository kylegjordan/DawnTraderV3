# B-ALERT-TAXONOMY — Scope (Step-1)

change-class: non_architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-10
**Trigger:** Kyle directive 2026-07-10 — *"when it is the governance checker that is sending messages, it doesn't just say system alert… a system alert should be specifically for errors that are happening related to the system. A governance issue… should be labelled something else, and then the alarms that we set so that we don't forget to do something, that should be something else."*

> Presentation + classification of §10.5 alerts. No engine/strategy/regime/signal-pipeline/schema change. Alerts live in a JSONL file, not a live table.

## Problem
Every §10.5 alert renders with one hard-coded header — `scripts/system-alerts.ts:84`: `🚨 **SYSTEM ALERT — <SEVERITY>**` — regardless of what it actually is. So a governance-checker doc-gap, a scheduled "go look at the results" reminder, and a real feed breakage all shout **SYSTEM ALERT**. Kyle can't distinguish a genuine system error from governance bookkeeping or a calendar alarm.

## ★ Second defect found while scoping (arguably the more important one)
**`info`-severity alerts NEVER reach Discord.** `scripts/system-alerts.ts` gates the webhook post to `warning` + `critical` only (line ~136: *"info skips"*). But **scheduled reminders are typically `info`** — e.g. the Aug-1 Wave-D forward-coverage verification I scheduled is `category=verification, severity=info`, so it would fire into the queue and **never post to Discord**. The alarms we set precisely so we don't forget are the class least likely to reach Kyle. Fixing the labels without fixing this would be cosmetic.

## Proposed taxonomy (3 classes; Kyle delegated the naming)
| Class | Display | Categories mapped | Discord posting rule |
|---|---|---|---|
| **system** | 🚨 **SYSTEM ALERT — <SEV>** | `breakage`, `health_check` | warning + critical (unchanged) |
| **governance** | 📋 **GOVERNANCE CHECK — <SEV>** | `governance` | warning + critical (unchanged) |
| **reminder** | ⏰ **SCHEDULED REMINDER** | `one_off`, `recurring`, `soak_verification`, `verification` | **POSTS AT ANY SEVERITY** (incl. `info`) — a reminder coming due IS the signal |

Alternates if Kyle prefers: *GOVERNANCE ISSUE* / *FOLLOW-UP DUE* / *TIMER DUE*.

## Objectives
- **OBJ-1 — Class the alert.** In `server/services/system-alerts.ts`: add an exported `alertClassOf(category)` → `'system' | 'governance' | 'reminder'` plus display metadata (emoji + label). **Also fix a real type/runtime mismatch: `'verification'` is written at runtime by the CLI (`npm run system-alerts -- add --category verification`) but is NOT in the `AlertCategory` union** — it fails `tsc` for any typed caller (hit this building the freshness monitor). Add it.
- **OBJ-2 — Render by class.** `scripts/system-alerts.ts` `formatAlertTextDiscord()` uses the class label/emoji instead of the hard-coded `SYSTEM ALERT`.
- **OBJ-3 — Fix the severity gate for reminders.** The `reminder` class posts regardless of severity; `system` + `governance` keep the warning/critical gate. (Otherwise scheduled alarms are invisible — the defect above.)
- **OBJ-4 — Make Langston's routed-alert prompt class-aware.** `comms-infra/discord/discord-langston-bridge.py:357` currently hard-codes *"[Discord SYSTEM ALERT — routed to you from the §10.5 alert dispatcher…]"*. Governance doc-gaps and calendar reminders should not be framed to him as system errors — his triage posture differs per class.
- **OBJ-5 — Verify the Telegram-era handler is dead.** `infra/helsinki/langston-alert-handler.sh:66` also hard-codes `SYSTEM ALERT` and references Telegram; MEMORY says it was archived + removed at B-TELEGRAM-DECOMM-2. Confirm it's not live; if it is, retire it per rule 18 (don't leave legacy lingering).

## Verification (Step-7)
- Fire one alert of each class on staging; confirm Discord shows the right header (🚨 / 📋 / ⏰) and that an **`info`-severity reminder actually posts** (it does not today).
- Confirm existing `breakage`/`health_check` behavior is unchanged (still warning+critical only).
- `tsc` clean (incl. the `'verification'` union fix); CI 4-green; deploy; governance (SIM comms/alerts entry, CHANGES, RUNNING_ISSUES for the info-gate defect, BATCH_CATALOG/PHASE_HISTORY, completion).

## ★ Step-1 APPROVED-WITH-CHANGES (Langston 2026-07-10) — folded in
**Q1 names:** accepted. **Q2:** ★ *do NOT layer a REPORT class over `health_check`* — both the #441 weekly report and a feed-stall watchdog are `health_check`, so a display class can't separate them and the report would still die at the severity gate. **Fix at the data layer: add a real `report` CATEGORY**; `health_check` stays purely degradation→system. **Q3:** posting is **class-driven, not severity-driven** — `reminder` + `report` post at ANY severity; `system` + `governance` keep the warning/critical gate. **Q4:** `non_architecture` holds; the completion + RUNNING_ISSUES must state the **outbound-behavior delta** explicitly (info-severity alerts now reach Discord that never did).

### ★ OBJ-1 GROWS A ROOT-CAUSE LEG (live-queue probe, 2026-07-10 — §8 #11 / NO-PATCHES)
Probe of the 254-line live queue: **13 distinct categories in use; only 6 are in the `AlertCategory` union; 9 are untyped** (`verification`, `scheduled_verification`, `weekend_restart_verification`, `b46b_soak_analysis`, `reorg_b2_1_window`, `tec_selfheal_verify`, `comms_decommission`, `reminder`, `test`). Meanwhile `health_check` is **typed but never used** (0 rows) — a perfect inversion. **Root cause: `category` is uncontrolled free text** — the CLI accepts any `--category` string, so every batch minted its own. `alertClassOf(category)` is only NO-PATCHES-clean if the set is CLOSED *and* closure is enforced at the write boundary. **★ 72% of all alerts (181/253) are `governance`** — three-quarters of what shouts SYSTEM ALERT at Kyle is the governance checker. That is the directive, quantified.

**Closed canonical set (Langston-approved as drawn):** `system` ← `breakage`, `health_check` · `governance` ← `governance` · `reminder` ← `one_off`, `recurring`, `reminder`, `verification`, `soak_verification` · `report` ← `report` (NEW). `health_check` stays in the union (legitimate future category, not dead).

**Two gates — close BOTH or it comes back (Langston):**
1. **Add-time (the real fix):** the CLI **REJECTS an unknown `--category`** and echoes the valid set. Fail loud at mint time — that is what makes the set genuinely closed rather than closed-by-convention.
2. **Render-time (belt + suspenders):** `alertClassOf()` on an unknown category **THROWS / logs loud — NEVER defaults to SYSTEM ALERT.** The silent default IS Kyle's bug. If gate 1 holds, gate 2 never fires; if it ever does, we want a scream, not a mislabel.

**Legacy migration — MUTATE, not alias (Langston; an alias table is the lingering-legacy indirection rule 18 forbids).** ★ **Blast-radius gate PASSED (proven, 2026-07-10):** zero code references any of the 9 legacy strings; the Langston bridge does NOT route on category (its only mention is advisory prompt text: *"your domain read OVERRIDES the category"*); in `system-alerts.ts` `category` is functional in exactly ONE place — a `listAlerts` query filter. **Render + filter only; no analytics/ML/join consumer, nothing persisted-and-read like the `paper_sim` discriminator (#405).** ⇒ backfill the 9 legacy strings to canonical as a **one-shot migration with a JSONL backup**. `test` = exactly **1** row (`beffed6d`, resolved, "B-DISCORD OBJ-5 test alert") — genuine noise, drop it. (Langston's count of 2 was off by one; verified against the live 254-line queue.)

### ★ NEW — OBJ-6: stale-acknowledgment detector (Langston: "build it here, one home")
**Why:** an alert that is `acknowledged` but never `resolved` goes permanently silent — nothing ever asks *"you claimed this and never closed it."* CC-B's audit proved the cost: **four batches were closed by SCHEDULING a verification and never writing the result back** (status fields still literally read "alert-gated"); not one of the four checks was ever performed. **One process gap that produced four data gaps.** The detector is the instrument whose absence allowed it.
**Build:** an alert `acknowledged` for > N days with no `resolve` is **re-surfaced loudly** (escalating, per the no-silent-drop guarantee). The mechanism is alert-state + a time threshold + re-surface = this engine's own plumbing (putting it in B-GOV-4 would invert ownership).
**★ Boundary (Langston — neither home may think it covers the whole gap):** the stale-ack detector catches only the **alert-gated** subset. A verification scheduled whose result was never written back to a status field, *when nothing was alert-gated*, is NOT caught by watching ack timestamps — that residue is **B-GOV-4 scope** (a closure-integrity check: a batch must not close with a status field still reading "alert-gated"/"pending-verify"). Detector → this batch; closure-integrity → B-GOV-4 / #443. Both recorded per §13.

## Open questions for Langston (Step-1) — RESOLVED above
1. Class names — `SYSTEM ALERT` / `GOVERNANCE CHECK` / `SCHEDULED REMINDER`. Agree, or prefer *GOVERNANCE ISSUE* / *FOLLOW-UP DUE*?
2. Category→class mapping: is `health_check` rightly **system** (archival watchdog, feed stalls = real degradation), even though a clean weekly freshness report also uses it? Or should a 4th **📊 REPORT** class exist for recurring informational summaries (the #441 weekly report is `health_check`+`info` — under the proposal it'd be a system-class alert that never posts)?
3. The reminder-posts-at-any-severity change — agree that's the right fix rather than forcing every reminder to `warning` (which would pollute severity semantics)?
4. `non_architecture` right? (presentation + classification; no pipeline/schema change)

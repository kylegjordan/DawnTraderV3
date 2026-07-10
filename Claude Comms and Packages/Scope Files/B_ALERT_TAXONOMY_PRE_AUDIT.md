# B-ALERT-TAXONOMY — Pre-Audit (Step-2)

change-class: non_architecture
**Owner:** CC-A · **Reviewer:** Langston · **Date:** 2026-07-10
**Scope:** `B_ALERT_TAXONOMY_SCOPE.md` (Step-1 APPROVED-WITH-CHANGES: 4-class taxonomy, `report` as a real category, class-driven posting, root-cause leg, OBJ-6 stale-ack detector).

## Components touched (SIM consult)
| Component | Role | Change |
|---|---|---|
| `server/services/system-alerts.ts` | The alert engine. `AlertCategory` union (6 members, line ~46); `addAlert`; `listAlerts` (the ONE functional `category` consumer — a query filter, line ~472); `processResurface`. Alerts persist to a **JSONL file** (`ALERTS_FILE`), not a DB table. | Add `verification` + `report` to the union; NEW exported `alertClassOf()` + display metadata; NEW stale-ack detector (OBJ-6). |
| `scripts/system-alerts.ts` | CLI (`add`/`fire-due`/`list`/`ack`/`resolve`) + `formatAlertTextDiscord()` (line ~78, the single hard-coded `🚨 SYSTEM ALERT` header) + the severity gate (line ~136, *"warning+critical post; info skips"*). | Render by class; **class-driven posting** (reminder/report post at any severity); **CLI REJECTS unknown `--category`** (the add-time gate). |
| `comms-infra/discord/discord-langston-bridge.py:357` | Langston's routed-alert prompt: hard-codes *"[Discord SYSTEM ALERT — routed to you from the §10.5 alert dispatcher…]"*. Category also appears as **advisory owner-hint text** (`"your domain read OVERRIDES the category"`) — **not a router**. | Make the prompt class-aware so governance/reminders aren't framed to him as system errors. |
| `infra/helsinki/langston-alert-handler.sh:66` | Telegram-era handler, also hard-codes `SYSTEM ALERT`; MEMORY says removed at B-TELEGRAM-DECOMM-2. | **Verify dead ON STAGING** (don't trust the doc — Langston). If dead: delete + `DELETED_COMPONENTS_LOG.md` (rule 18). |
| The live alerts JSONL (254 rows) | The data. | One-shot **MUTATE** migration of 9 legacy categories → canonical, with backup. |

## Blast radius
**Presentation + classification + one JSONL backfill.** No engine/strategy/regime/filter/signal-pipeline change; no DB schema (alerts are a JSONL file). The one behavior change is **outbound**: info-severity `reminder`/`report` alerts now reach Discord that never did before (this is the point, and must be stated explicitly in the completion + RUNNING_ISSUES — Langston).

**★ Mutation safety (blast-radius gate PASSED, proven 2026-07-10):** `category` is **render + a single `listAlerts` query filter**. Zero code references any of the 9 legacy strings. The Langston bridge does NOT route on it. No analytics/ML/join consumer; nothing persisted-and-read like the `paper_sim` discriminator (#405). ⇒ **mutate, don't alias** (rule 18 — an alias table is exactly the lingering-legacy indirection we forbid). `test` = 1 row (`beffed6d`, resolved) — drop.

## Migration plan (one-shot, reversible)
1. `cp system-alerts.jsonl system-alerts.jsonl.bak-pre-taxonomy-2026-07-10` (backup FIRST).
2. Backfill **`category` ONLY** — `scheduled_verification`, `weekend_restart_verification`, `b46b_soak_analysis`, `reorg_b2_1_window`, `tec_selfheal_verify` → `verification` · `comms_decommission` → `one_off` · `reminder` stays · `test` → **drop the 1 row** (`beffed6d`, resolved).
3. Verify: every row's category ∈ the closed set; row count 254 → 253; `listAlerts` filters still resolve.
4. Rollback = restore the `.bak`.

### ★ CROSS-BATCH SAFETY (CC-B flag, 2026-07-10) — this migration rewrites the JSONL that #445's evidence rests on
`#445` + `B_ALERT_LIFECYCLE_FOUR_ALERT_DISPOSITION.md` cite four alerts **by `id` AND by `state`** as the load-bearing proof that four verifications were never performed. A whole-file rewrite that normalized or dropped a state field would make that ledger entry **silently uncitable — and it would still *read* fine.** A row-count check cannot catch that.
**INVARIANTS — the migration mutates `category` and NOTHING else:**
- `6f8db90b`, `c2aa2940`, `06532d55` must remain **`acknowledged`** (the three still-open Class-(I) un-run verifications — NOT resolved, NOT swept).
- `da0c24b8` must remain **`resolved`** with its evidence intact.
- **Post-migration ASSERT** (not row-count): all four ids still present, with `state` / `acknowledged_at` / `resolved_at` **byte-identical to the `.bak`**. Fail the migration and restore if any differ.
- Dropping `beffed6d` must not reindex/renumber anything other entries reference (JSONL is id-keyed, no positional refs — **confirm at build**).

### ★ DESIGN CONSTRAINT ON OBJ-6 (falls out of the above — CC-B)
**Three of those four must stay `acknowledged` INDEFINITELY** until `B-VERIFY-BACKLOG` actually runs the queries. Therefore **the stale-ack detector is a SURFACER, never an auto-closer.** A long-lived `acknowledged` row is *precisely the thing to raise*, not to "tidy." OBJ-6 must never auto-resolve, auto-clear, or suppress on age — it re-surfaces, loudly and escalating, and a human/CC resolves it with evidence. (Auto-resolve is a *separate* leg and belongs to `B-ALERT-LIFECYCLE`, not here.) A comment to this effect goes in both the detector and the migration so a future reader cannot "clean up" the evidence.

## ★ OBJ-6b — mint-time observability check (Langston RULED 2026-07-10)
**The blind spot:** a **Class-(II) permanently-unsatisfiable** verification sits *legitimately* `acknowledged` forever — a stale-ack **timer structurally cannot catch it**; it would politely ignore exactly the class we most want caught.
**Ruling:** a **second leg — named and separately verified — `OBJ-6b`**, not a vague absorption into OBJ-6 and not its own item with its own home. Reason: the blind spot is a property of the **seam between the two mechanisms** — the stale-ack timer catches *neglect*; the mint-time check catches *un-runnability*. Split them and the seam goes unowned; merge them silently and neither gets verified.
**Build:** at `addAlert`, assert the verification's condition is **observable under current config** (e.g. "requires active trading" when active trading is OFF ⇒ flag at mint time, don't silently schedule); re-assert on config change. Verified separately from OBJ-6 at Step-7.
**Precedent that motivated it:** `da0c24b8` was *initially misfiled* as Class (II) on the false premise that its admit branch needed active trading. Code+data proved VTS reaches the admit branch independent of active trading (regime occurrence exercises it) ⇒ it was Class (I), and it RESOLVED on evidence. **Class (II) currently has zero confirmed instances — but the class is real (CC-B's #445 cut), and OBJ-6 alone cannot see it.**

## ⚠ HOME CONFLICT to reconcile before build (one-home convention)
CC-B's **#443** homes the *acked-but-unresolved sweep* to a NEW batch **`B-ALERT-LIFECYCLE`**; Langston separately ruled the **stale-ack detector** into **`B-ALERT-TAXONOMY` OBJ-6** ("build it here, one home — the mechanism is alert-state + time-threshold + re-surface, this engine's own plumbing"). **Same mechanism, two homes.** Must be settled by the crew before either batch builds it — proposal: OBJ-6/6b (detector + mint-time check) live in **B-ALERT-TAXONOMY** per Langston's explicit ruling; `B-ALERT-LIFECYCLE` keeps the *auto-resolve* leg + consumes the detector's signal; `B-GOV-4` keeps the closure-integrity check. Raised to the crew 2026-07-10.

## Open questions for Langston (Step-2)
1. Stale-ack threshold `N` — I propose **14 days** acked-without-resolve → re-surface, escalating. Too tight (the Aug-30 / Aug-1 scheduled verifications legitimately sit long)? Suggest keying off `triggers_at`, not `created_at`, so a future-dated reminder isn't flagged before it's even due.
3. Migration: drop the 1 `test` row outright, or backfill it to `one_off` and mark resolved (preserving the 254-row count)? I lean drop — it's a `B-DISCORD OBJ-5 test alert`, already resolved, zero information.
4. The CLI reject (add-time gate) will **break any caller passing a legacy string**. I've grepped: no code passes `--category`; all uses are human/CC-invoked. Confirm you're comfortable it's human-only, or want a one-release deprecation warning first?

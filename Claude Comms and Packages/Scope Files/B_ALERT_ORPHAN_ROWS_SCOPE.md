# B-ALERT-ORPHAN-ROWS — SCOPE

change-class: non_architecture

**Owner:** NEW Claude (CC-B) · **Directive:** Kyle **KD-116** (2026-11-22, relayed by PM Claude, Discord 1574135433917505748; recorded `55b3b2795`, binds under KD-92) · **Parent:** R-1 of `B-ALERT-INSERT-CONTRACT` (`#1255`, CLOSED 2026-11-22).
**Kyle's words, verbatim:** *"Remove the 12 orphaned operator-alert rows that point at deleted users, as gap work while B-ENTRY-GATE Step 7 waits, ONLY IF it is quick and easy. Whether to also enforce the user link is your call with Langston (KD-34), inside the same small change. If it isn't quick (for example, no governed write path), tell me and it goes back to Kyle; it does not grow. Keep any deploy out of the shared one-sha deploy after 11-23 21:00Z unless you and OLD agree."*

## Quick-and-easy test (KD-116's own gate)
A governed write path exists: a forward migration in `drizzle/migrations/`, registered in `MANIFEST.txt`, applied by `dt-deploy` (`npm run db:migrate`, `scripts/dt-deploy.sh:350-353`), with an exact-restore rollback file tracked in git. **Verdict: quick.** If Step 2 or review finds otherwise, the batch stops and goes back to Kyle — it does not grow.

## Objectives
| # | objective | verification |
|---|---|---|
| **O1** | Delete every `system_alerts` row whose `user_id` matches no `users.id` — on staging today exactly 12 (`ce50e56b-0208-4fca-9c14-2777db4104b7` ×10 `feed_health`, `3ace5ebb-06f2-4116-8e60-f130425bab52` ×2 `walter_memory_limit`). | Post-deploy `dt-sql`: orphan count = **0**; total rows = pre-deploy total − 12 (pre-count taken at deploy, not quoted from today). Positive control: the same orphan query returns 12 before deploy. |
| **O2** | Ship an exact-restore rollback: the 12 rows re-inserted verbatim (all columns, ids included) with `ON CONFLICT DO NOTHING`. | Rollback file tracked in git, 12 statements; each row's id matches the pre-deploy read. Not executed unless needed. |
| **O3** | Decide the user link (KD-34, with Langston): enforce a database foreign key here, or not. **Proposal: NOT here** — the ORM declares 44 user links (`schema.ts`, 44 lines matching `references(() => users.id)`) and the database enforces **none** (0 of 30 public foreign keys reference `users`). Adding one is a class-wide question, not a one-table fix; if wanted it returns to Kyle as a proposal. | Langston's Step-1/2 ruling recorded; outcome written into the completion report. |

## Out of scope
Any foreign key; any change to `AlertsService` or the alert routes; the other 43 ORM-only user links; any data outside `system_alerts`.

## 1.a architectural read
`SYSTEM_IMPACT_MAP.md` §2.1.1.a *The operator alert store* (`:345-353`: one insert path, readers, the second unique rule, removed cleanup, blast radius MEDIUM, not in the trade path) and `SYSTEM_MANUAL.md` (`:11177`, table row; `:7892`, the `feed_health` alarm path). The R-1 finding itself: `Scope Files/B_ALERT_INSERT_CONTRACT_PRE_AUDIT.md:89` (§C). This batch changes no component, only rows.

## 1.b provenance
- **`system_alerts`** (TIER 1 — rows change): introduced `38947d056` (2025-10-08) *"Add persistent storage for trading data and AI learning across different modes"*; carried into the 2026-04-22 initial schema (`drizzle/migrations/2026-04-22-initial-schema.sql:6733`) with `system_alerts_pkey`, `unique_global_alert` and a unique index on `(user_id, mode, timestamp)` — **no foreign key**. The ORM's `.references(() => users.id)` (`shared/schema.ts:1546`) was never enforced in the database.
- **The 12 rows:** dated 2025-10-24/25 (Replit era), all acknowledged. No user-deletion path exists in today's code (`git grep` for `deleteUser`, `delete(users)`, `DELETE FROM users` over `server/` and `scripts/` at the ref: no hits), so the users were removed outside the app — **INFERRED-FROM-CODE**, not established.
- **Disposition:** the rows are **(5) disconnected and should be deleted** — they point at nobody, and the one action route (`routes.ts:18640-18647`) selects by id AND user, so no live user can act on them.
- Corpora searched: `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, the `B-ALERT-INSERT-CONTRACT` report (R-1 at `:19`), `git log -S`.

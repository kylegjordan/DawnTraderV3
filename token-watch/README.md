# token-watch — a capture-only observation study of new token launches

**This is a recorder, not a market.** It trades nothing, holds nothing, and touches no part of the DawnTrader trading system. It records every new Solana token launch at birth, re-checks each one on a fixed schedule, and in 90 days hands us the survivors **and the far larger population of failures, recorded identically from the same starting line**.

> **The durable prize is the machinery, not the tokens.** The published survival result already exists; re-deriving it replicates a paper. What we keep is **case-control survival machinery built where a published answer key exists to check our work against** — then pointed at `#594`/`#596`/`#597`, which are the same statistical problem on scarce data with no answer key. **A null result still delivers it.**

---

## ⛔ THE FENCE

Langston's condition, and the reason for it is arithmetic rather than caution: bounded-loss/frequent-modest-win and near-total-loss-on-nearly-all need **opposite sizing, opposite position counts and opposite kill-switch semantics**. Different systems, not one system with a new input.

- No strategy · no regime-strategy map entry · no orchestrator contact · no mode-axis appearance
- No wallet, custody, execution or order path
- **No study data in the trading database. No computation on the trading box.**
- **Hosted on Helsinki, never on the trading box** — the diff test cannot enforce this, because ~20,700 requests/day produce no diff at all while still contending for CPU and disk. So it is stated in the service unit, where it is visible in a listing.

**The staging page (Phase 4) is the one permitted exception**, and it is bounded to a named five-path set with per-file line budgets. **The study's own files live in their own folder**, so the fence is a *path* rather than a judgement.

---

## The pieces

| file | what it does |
|---|---|
| `config.py` | Every number the study depends on, each traceable to the pre-registration or the scope. **Changing one means amending that document first** — the code is downstream of the registration. |
| `store.py` | Append-only file store. Answers the census questions (who writes / reads / mutates / **deletes** / schedules) **in its own header, at design time**. |
| `providers.py` | **Every** outbound network call. One module, so the credit budget is a chokepoint rather than a convention. |
| `receiver.py` | The birth receiver. The only writer of census records. |
| `follow_up.py` | Hourly checkpoint sweep. Opens exactly one hour-bucket file. |
| `budget.py` | Credit reserve, shed order, burn monitor. |
| `tier.py` | Compresses bulky payload a day old into `cold/` and removes the hot copy. It can reach nothing but bulky payload. |
| `ops/cold_offbox.py` | **The off-box cold leg** (B-TOKEN-WATCH-STORAGE). Daily at 05:30 UTC as user `tokenwatch-cold`: each `cold/*.gz` over an hour old is decompressed to EOF, uploaded to Backblaze B2 (`dt-archive-cold`, under `token-watch/cold/`), downloaded back by file id and compared, logged in `offbox/cold-offbox-manifest.jsonl`, and only then removed locally. It is the only thing that deletes from `cold/`, and it refuses any key not restricted to `token-watch/` or able to delete. |
| `ops/store_watch.py` | Daily at 06:00 UTC as root: measures the store with `liveness._store_size_check()` (and nothing else from liveness) and mints a system alert above the 6 GiB warn line or the 8 GiB cap. |
| `ops/unit_failed.py`, `ops/alert_mint.py` | Every token-watch unit names `token-watch-failed@.service` in `OnFailure=`; it mints an alert carrying the unit's last error lines. `alert_mint` is the one mint path (the same form as `dt-deploy-drift.sh`). |
| `ops/` and the collector | **ops/ is outside the collector on purpose**: `test_pipeline.py` holds the collector to one outbound module (`providers.py`, the budget gate); the ops jobs reach B2 or run local commands for reasons unrelated to the provider budget. `test_ops_boundary.py` keeps the two apart. |
| `deploy/` | `cold_offbox_access.sh` (the user and ACL, with assertions) and `install_storage.sh` (install from git blobs at a reviewed sha; writes `/opt/token-watch/INSTALLED`). |
| `tools/mint_cold_key.py`, `tools/prove_cold_key.py` | Mint the restricted B2 key once, and prove by refusal what it cannot do. |

### Reading the off-box archive back
Each manifest line names the object (`b2_name`) and its `file_id`; fetch by id with any B2 client authorised for `dt-archive-cold`, then check the `sha256`. **If the manifest is ever lost**, the census is the object listing under `token-watch/cold/` with each object's sha1 (which listing call depends on whether the key can hide files — recorded by `prove_cold_key.py` at install; see the B-TOKEN-WATCH-STORAGE completion report). `tools/backfill_creator_stake.py` reads `cold/` directly and will find only the newest day there after the drain; fetch older days from B2 first if it is ever re-run.
| `tests/` | Five suites, 141 checks. **Every block carries a positive control**, and `test_wiring.py` drives PRODUCTION entry points only — it exists because a reviewer found 57 checks passing while nothing tested the seam between two modules. |

## Running the tests

```bash
python token-watch/tests/test_collector.py
python token-watch/tests/test_pipeline.py
python token-watch/tests/test_wiring.py
python token-watch/tests/test_round2.py
python token-watch/tests/test_mutations.py
```

All five use a scratch tree via `TOKEN_WATCH_ROOT` and make **no network calls**.

---

## The decisions worth knowing before changing anything

**Births are never sampled and never deleted.** There is no state of the budget in which a launch goes unrecorded. A gap in the census destroys the denominator of every rate in the study, and reconstruction means 43.2M transactions/day — measured as unaffordable at every provider tier. **Reconstructable but unaffordable is operationally not reconstructable.**

**Both timestamps are recorded** — on-chain creation *and* first sight. We see a token only once the feed notices it, and with ~68.67% dying on launch day any delay removes a large and **non-random** slice. Size-at-birth is the strongest published predictor, so a delayed first sight silently turns it into *size-at-discovery* while we keep calling it the published variable. Persisting both converts an unknown bias into a measured one. **This is left-truncation, not survivorship** — the name changes the fix.

**The grid is fixed ages from creation, never from discovery.** Fixed ages let cohorts from different launch days pool. An adaptive schedule would make coverage "whatever we could afford", which is unstateable at analysis time.

**The control arm is deterministic, not random.** A hash gives a reproducible uniform draw, so which tokens were eligible can be re-derived afterwards. In a pre-registered study, *"we sampled randomly, trust us"* is exactly the claim nobody can check. The realised inclusion probability is **logged daily** and the analysis uses the log, not the constant.

**Death classification refuses to guess.** *Faded* and *liquidity-pulled* both end at zero, so a win/lose column would treat them identically — but they may differ on day one, and that difference is a primary object of the study. Where the evidence does not distinguish them, nothing is recorded and the token stays in the schedule: a wrongly tombstoned token is never re-checked, which is unrecoverable, so ambiguity costs one more observation rather than a record.

**Two periodic jobs ship** (hourly follow-up, daily tiering); two more are designed and not built. All periodic work takes one exclusive lock, and a job that cannot get it **skips and says so** — "could not get the lock" and "did the work" must never be the same code path. **The receiver is a third state writer and takes no lock**, which is why it only ever APPENDS to a journal that the locked jobs fold in. ⚠️ An earlier version of this file claimed four schedulers and omitted the receiver entirely; a census that describes the design rather than the code is worse than none, because it is read as the code.

---

## Honest limits

- **The coverage control is not built yet.** `chain_creations()` raises deliberately, and **no timer ships for it**, because a coverage control in the service listing that never measures anything is worse than an absent one. It lands in the Phase-3 proving run against live paging, verified rather than assumed.
- **Its reach, when it lands, covers one leg of three**: it catches **delivery loss** — a push that drops silently with no local error. It does **not** catch provider-side indexing gaps, because it asks the same provider.
- **The free follow-up service needs no account, so there is no service guarantee.** If it throttles, the fallback is chain-direct on the spare allowance — **which is the same headroom the liquidity leg uses**, so fallback and liquidity compete. Stated now rather than discovered later.
- **A webhook push drops silently.** Nothing in the receiver can detect that. Its silence is not evidence of a quiet market.

---

## Documents

`Claude Comms and Packages/Scope Files/` — `B_TOKEN_WATCH_SCOPE.md`, `B_TOKEN_WATCH_PRE_REGISTRATION.md` (append-only; amendments only), `B_TOKEN_WATCH_PRE_AUDIT.md` (the Step-2 audit and plan).

**The pre-registration is append-only by design.** Editing it in place would destroy the only thing it does.

# #994 paper exit episode notifications — Step 1 evidence

**Review change:** The [scope proposal](../Scope%20Files/B_PAPER_EXIT_EPISODE_NOTIFY_SCOPE.md) and this evidence record are the only proposed changes at this ref. Serving app Phase A is `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, restart 716. The temporary #1191 dispatcher was r2 `423616c38605afa70e282572a432cd32dcabf290`, with no application deploy (INFRA Discord `1575628060835713065`).

## 1. Reproducible join for Nov 26, 2026 (UTC)

1. Bound the natural invocation using `journalctl --utc -u system-alerts-dispatcher.service --since '2026-11-26 21:42:29' --until '2026-11-26 21:42:50'`. Starts `21:42:33`, finishes successfully `21:42:38`. In `/var/log/dawntrader/system-alerts-dispatcher.log`, the invocation says `promoted 15 alert(s) to active`, followed by 15 `Discord alert posted` receipts. Use these exact successful first-send IDs. A `fired_at` timestamp alone is a promotion marker.
2. Read `/var/log/dawntrader/system-alerts.jsonl` in full, taking the latest row per UUID. Select every row with `fired_at` in that invocation, regardless of title or key. The population is 15 IDs, all promoted at `21:42:33.665`. All 15 IDs match one first-send receipt and a distinct `price-skip-paper-<pair>` warning (`breakage`, `classVerdict=thin`, `escalation=duration`). All share `triggers_at=21:30:48.569`. They were created from `21:30:49.017` (PGR) through `21:30:56.149` (TJX).
3. Join each warning's `metadata.positionId` to `metadata.members` of the one standing paper xStock record that spans the sweep, `e80d1129-3865-478b-abba-b93f72350140` (created Nov 25 `21:17:23.834`, still active at read). All 15 position IDs match their symbols in the record. That record has 16 stored members at read, so use the actual held list to assign episode membership. In `/var/log/dawntrader/out.log` the `21:30:56` sweep reports `mode=paper T=0 verdict=thin resolved=15 failed=0 newEscalations=15 unmatchedKeys=0 held=15`, with the exact symbol and family set below. For each alert key, the old row was resolved by `active-exit-monitor` with `SUPERSEDED-BY-DURATION-PAGE position=` and the same position ID. The measured `21:29:47` and `21:31:49` sweeps each held the 15 but minted zero. Archiver controls at `21:29:28`, `21:30:28`, and `21:31:28` each had `symbols_updated_60s=0` with the feed connected. That measures near-silence in this feed, independent of the warning title.
4. **Controls:** PGR `7c90b386…` appears in all three joins. The standing info row itself has no receipt in the dispatcher run. This run's 15 rows are first notices with fresh IDs, separate from the frozen VTS repeat list (449 still active and one resolved in INFRA's read). A title-only cut would not establish that all rows from the invocation were joined or that an unrelated warning could still pass.

| Pair (USD) | First alert ID | Recorded reasons |
| --- | --- | --- |
| PGR | `7c90b386-9cba-43e9-919e-9bde58e4129d` | Quiet market |
| UL | `5dff9368-b5b6-4aa4-9a67-1d56ed9e7af0` | Book state and quiet market |
| PPL | `3fc24304-80c1-4887-829b-fb415b845f16` | Book state and quiet market |
| MGM | `f57065a8-cb4f-40cf-818b-8262e90cf84c` | Quiet market |
| HPQ | `be32a30d-d9ef-4df1-9356-591af7bd7859` | Book state |
| TGT | `fd9af2b2-1d53-485f-8383-3faa39bbf96d` | Quiet market |
| EWL | `ed022007-a9bc-480a-b559-486d32f361dc` | Book state and quiet market |
| CME | `b1ba475a-1072-4903-a3bf-bc5a77d9428a` | Book state and quiet market |
| PCG | `991ce378-e78b-4ed9-a5d6-5aa890dc6516` | Book state and quiet market |
| AZN | `b56c5ec5-6dad-4001-8e59-07e475a68734` | Book state and quiet market |
| BAX | `0f48b92f-e6af-4801-a536-254998fae652` | Book state and quiet market |
| CARR | `7327f6c5-d84b-4361-8022-954617253038` | Book state and quiet market |
| NVO | `fa6f5a67-8ed4-45c9-a185-2007070f7b7c` | Quiet market |
| XBI | `400c639d-3f1f-42a9-83be-277c9d824936` | Quiet market |
| TJX | `4fb9793b-5c78-4a40-b0c3-fca872ac857e` | Book state and quiet market |

**Source boundary.** The evidence supports one shared near-silent duration escalation. The per-position reasons still matter and are not interchangeable. A verified quote and later exit decision are separate evidence for recovery. The review starts from the exact position alerts plus the before/after sweeps, the standing record and the delivery receipts. No handling state was changed.

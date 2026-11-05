# B-WAKE-OPENING-LIST — Step 4 change list

## Dispatch header
- **(i) Declared change-class:** `non_architecture` (scope header).
- **(ii) That class's doc set:** scope `B_WAKE_OPENING_LIST_SCOPE.md` r4a **present** (Step 1 APPROVED) · pre-audit `B_WAKE_OPENING_LIST_PRE_AUDIT.md` r2a **present** (Step 2 PROCEED, conditions A and B; B landed at `5e577e841`) · this change list **present** · completion report **absent, not yet due** (Step 11) · SIM "Discord Comms Fabric", `COMMS_BRIDGE_RUNBOOK.md`, the A8 rules-sweep lines, `DELETED_COMPONENTS_LOG` (A2, `CC_NAME_RE`) **absent, not yet due** (Step 10, P9).
- **(iii) Step-2 reference:** `Claude Comms and Packages/Scope Files/B_WAKE_OPENING_LIST_PRE_AUDIT.md` r2a.
- **Graded ref:** `29900e378` (code + tests) and the commit carrying this list (the replay tool). Diff: `git diff 4b3d081ff..<this commit> -- comms-infra/ scripts/analysis/`.

## What changed, by plan item
**P1 `comms-infra/discord/address_list.py` (new, 92 lines).** `opening_list(text, registry) -> (names, end)`; `opening_addressees` = its set. One `MARKUP` class `[@\s*_~\`>#:".\-]*` (no `<`); `SEPARATOR` = markup + (`,` [and] | `&` `/` `+` | `and`) + markup — bare whitespace is not one. Each alternative is matched ANCHORED at the position against the FULL string (`rx.match(text, pos)`), longest wins, each must end at `\b`. `REGISTRY` = `SESSION_NAMES` + `REVIEWER_NAMES` (LANGSTON: langston; COLTRANE: coltrane, codex).
⚠️ **Judgement call for you:** `SESSION_NAMES` is a PINNED COPY of the filter's `NAMES` — the scope says "the existing registry", but the Helsinki consumers cannot import the laptop filter and none existed there. `address_list_test.py` reads the filter's `NAMES` with `ast` and fails unless they are equal; the filter keeps its own list so its latch works with the module missing.

**P2 `discord-langston-bridge.py`.** Gate (`:1207`): `elif author_is_cc_bot and "LANGSTON" in dc.opening_list(content)[0]`. Refuses to start (exit 2, stderr) when `dc.ADDRESS_LIST is None` — the bridge's load IS `discord_common`'s (one pinned load, judgement call). `ADDRESS_START_RE` and the dead `CC_NAME_RE` deleted.

**P2a `discord_common.py`.** `load_address_list()`: read bytes once → sha-256 vs `ADDRESS_LIST_SHA256` → exec those same bytes → known-answer probe (`"OLD Claude, Coltrane and Langston - probe"` → `[CC-A, COLTRANE, LANGSTON]`); never raises. `_send_chunks`: `addressed_langston = "LANGSTON" in opening_list(content)[0]`; **degraded** (load failed): addressed = True (split + marker if long), `--notify` suppressed, one log line. The `--notify` mention goes just after the opening list's last name (`opening_list(chunks[0])[1]`) whenever the list is non-empty — judgement call: not only for Langston, or `cc-send --notify "OLD Claude — x"` would stop waking OLD Claude under the new filter rule; at the start only when the list is empty. Its `ADDRESS_START_RE` mirror and the "kept in sync" comment deleted.

**P3 `coltrane-bot.py`.** Loads `/opt/discord-bridges/address_list.py` by absolute path (env `COLTRANE_ADDRESS_LIST`, tests only), same sha + probe; non-Kyle gate = `"COLTRANE" in opening_names(text)`; `main()` returns 2 before connecting on a failed load; `NAME_START_RE` removed; reply prompt (A7): "Several people? Open with all their names as a list … a name that appears only later in the reply wakes nobody."

**P5 `cc-wake-filter.py`.** Loads `address_list.py` from beside itself, else `../discord/` (repo), inside one `except Exception`. Latch causes: sha drift, failed load, registry without this alias, probe failure (own display name must parse to own alias); one `WAKE[WATCHER-DRIFT]` per cause, recorded in the state file (`address_list_latch`), cleared when healthy; latched ⇒ `MY_RE` anywhere (today's rule). A parse that throws on one line decides that line the old way and logs it. Crew branch (`:1300`): `deliver = crew_post_names_me(full) or CREW_ALL_RE.search(full)`. Kyle, voice, wake-file and Langston-reply branches unchanged.

**P6 tests (all re-run by me after the build).**
| suite | result |
|---|---|
| `comms-infra/discord/address_list_test.py` (new) | 56 / 0, exit 0 — every scope parser case, the sha pins computed from the file, the NAMES copy equality |
| `comms-infra/discord/test_address_gates.py` (new) | 53 / 0 — bridge gate, sender (3-chunk "Coltrane, and Langston" split + marked and reassembled COMPLETE n/n through the bridge's own reassembly; `--notify` after the list; **the r1 code at `5e577e841` FAILS both — control**), the degraded sender |
| `comms-infra/codex/test_coltrane_address.py` (new) | 22 / 0 — bot gate and refusal |
| `scripts/analysis/test-wake-opening-list.py` (new) | 134 / 0 — every session × every `NAMES` form through the filter in the `==> file <==` frame, positive control first; latch cases |
| `test_coltrane_recovery.py` (pointed at the repo module), `test_coltrane_reviewer_role.py`, `test-wake-filter-cuts`, `-follow`, `-lease`, `-lease-verdict`, `-state-unsaved`, `test-heartbeat-control` | all pass, exit 0 |
| `comms-infra/discord/mutate_address_list.py` (new) | **11 of 11 caught**, by exit code and named FAIL line; each suite first runs unmutated in the copy |
| **`scripts/analysis/replay-wake-opening-list.py` (new) — the month replay** | **MATCHES the scope's pre-registration exactly:** 3,666 raw → 1,950 kept; **272 posts, 345 lost pairs (CC-C 122 · CC-B 109 · CC-INFRA 65 · CC-A 42 · CC-PM 7); 0 gained**; harness controls first |

**Not runnable on Windows** (named, not hidden): `test_bridge_clean_stop.py` (Helsinki-only), `langston_queue_test`, `alert_lane_test`, `test_coltrane_memory`, `test_r2_swap_red`, `test_telegram_corpus_install` (POSIX modules) — none imports a changed file.

**Stated limit (the builder's catch):** the mutation that drops the LOOKBEHIND half of the position rule survives — no character the parser can stand after is a digit, so the scope's "Langston, 3 PM Claude" case ends the list before the lookbehind matters. Only the position half (`match` → `search`) is mutation-proved.

**Every `address_list.py` pin equals the committed BLOB**, checked on Linux: `edbf3b0f…` from `git cat-file blob 29900e378:comms-infra/discord/address_list.py` in the Helsinki mirror.

## Not yet done (later steps)
P4 (Coltrane drop-in `StartLimitIntervalSec=5min` + scratch drill), P7 install (conditions A/B: `live-vs-sha.py`, `verify-agent-artifacts.py`, the hand compare for the drop-in and the laptop pair), P8 live posts, P9 governance, P10 (A6 to Kyle via PM Claude — sent 11-05).

## Judgement calls I want attacked
1. `SESSION_NAMES` as a test-fenced copy of the filter's `NAMES`.
2. The `--notify` mention placed after ANY non-empty opening list, not only Langston's.
3. The bridge refusing on `discord_common`'s load rather than pinning its own (three pins, not four).

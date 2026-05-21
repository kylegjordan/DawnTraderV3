# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix; §6 Langston comms; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Kyle directive 2026-05-20: summaries TO KYLE go in THIS session, not Telegram-only. Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-21 — B79.0n.HYGIENE CLOSED, UNIVERSE-DISCOVERY NEXT)

**B79.0n.HYGIENE CLOSED 2026-05-21.** Deploy commit `6050165cf`. Step 8 Langston ACK clean (all 8 independent checks PASS — Telegram msg 4048).

**Shipped:**
- Boot-time round-trip smoke test (`server/index.ts:24-49`) — set('boot_smoke_test') → get → assert → reset with `process.exit(1)` on either ReferenceError throw OR value mismatch. Catches no-op-shim drift (Langston Q2 tightening).
- Import-hygiene regression unit test (`server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts`) — walks server/+shared/ TS files, strips comments+strings, per-file `codeRefCount > 0 ⇒ import present` assertion. Skips definition file + test files (Langston Q-Step4-4).
- Registry trim: BITF/HOLX/PARA/SAGE/WBA removed from `XSTOCK_SPOT_REGISTRY` (`shared/asset-classes.ts:306,386,451,482,527` → comment markers) + `xstocks-universe.json` (sync invariant restored) + consolidated `KNOWN_NONEXISTENT_NAMES` entry per CLAUDE.md §5 #14. Registry size 265→260; sector floors maintained (XLV 40 / XLK 38 / XLC 21 / XLP 14).

**Surprise finding (pre-audit):** the setNullReason bug was ALREADY RESOLVED by the current bundle (240s observation → 0 new errors; last setNullReason instance 2026-04-03, 47 days before HYGIENE close). The 64,494 historical occurrences are pre-2026-05-20-12:08-UTC-bundle artifacts. Source has had the import continuously since Batch 31 (March 2026). Bundle non-determinism (esbuild) likely root cause; not bisected per Langston Step 2 Q1=A (structural fence > archaeological closure, NO PATCHES doctrine).

**Three mandatory completion-report disclaimers** (per Langston Step 2 ACK) landed in `B79_0n_HYGIENE_COMPLETION_REPORT.md`: pre-current-bundle disclaimer (historical 64,494 ≠ live bug), root-cause-unverified disclosure, op-hygiene flag (future PM2 error log rotation — RUNNING_ISSUES #124 OUT OF SCOPE for HYGIENE/umbrella).

**Onboarding learnings captured** (CLAUDE.md §3.3 mandatory). Key one: hardcoded-registry pattern is a recurring structural cost. The fix is dynamic universe discovery (see NEXT below).

### MID-BATCH ARCHITECTURAL DIRECTIVE 2026-05-21 PM (Kyle)

Crypto auto-discovers from Kraken REST `AssetPairs` (~1,544 pairs live every cycle). xStock has NO equivalent endpoint — Kraken's public REST API does not index xStock instruments at all; they only stream through `wss://ws-equities.kraken.com` with no "list all" message. So xStock requires manual registry maintenance that scales poorly as Kraken adds more tokenized stocks.

**Locked decision:** insert NEW sub-batch `B79.0n.UNIVERSE-DISCOVERY` as #2 between HYGIENE and STORAGE. Umbrella v2 → v3. Sub-batch count 17 → 18. STORAGE shifts 2→3, all subsequent +1.

**UNIVERSE-DISCOVERY architecture (Kyle-locked 2026-05-21 PM):**
1. **CoinGecko** tokenized-stocks category for "what tokenized stocks does Backed Finance currently issue" (CoinGecko already wired in `external-macro-feed.ts` for `/global` endpoint; no API key required for public endpoints).
2. **Kraken WebSocket subscription probe** to confirm which CoinGecko-listed symbols Kraken's xStock product currently accepts subscriptions for.
3. **Finnhub** (already wired in `stocks.ts`; key may need re-provisioning per BOOT log) for per-symbol sector / cryptoAdjacent / ADR flag lookup.

DB-cached snapshot with daily refresh + ad-hoc trigger. Fallback: last-known-good snapshot → hard-coded bootstrap set → fail-fast at boot. Convert exact-equality test asserts to range asserts (`size >= MIN && size <= MAX`).

---

## NEXT IMMEDIATE STEP

**Draft `B79_0n_UNIVERSE_DISCOVERY_SCOPE.md`** as Step 1 scope. Standing dispatch pattern: file-first inbox path `/home/langston/inbox/b79-0n/`, fresh UUID per dispatch, verification anchor. Use the 9-section scope template from umbrella §3.

ALSO update the umbrella file `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` to **rev 3**: insert UNIVERSE-DISCOVERY as sub-batch #2; shift STORAGE 2→3 and all subsequent +1; total count 17→18; dependency graph updated (UNIVERSE-DISCOVERY independent like HYGIENE; STORAGE now depends on UNIVERSE-DISCOVERY so it inherits the dynamic registry). Dispatch umbrella v3 + UNIVERSE-DISCOVERY Step 1 scope to Langston for concurrence in a single combined dispatch.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak verification 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak verification 2026-05-31. No action.
- `283bd74e` — B-NEW-36 first weekend_shutdown timer fire verification Fri 2026-05-22 8:05 PM ET. No action until then.

### Recent commits
- `<pending HYGIENE close commit>` — B79.0n.HYGIENE governance close (BATCH_CATALOG + PHASE_HISTORY + RUNNING_ISSUES + completion report + MEMORY)
- `6050165cf` — B79.0n.HYGIENE fix-forward (vitest import)
- `c18704eed` — B79.0n.HYGIENE primary implementation
- `8d34a5730` — B79.0n.HYGIENE Step 1 scope
- `6e9810171` — B79.0n umbrella v2 Langston FINAL ACK
- `4a997eae2` — B-NEW-36 sub-batch (b) canonical deploy

### Permissions reminder
`.claude/settings.local.json` has `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. Addresses Claude Code v2.1.7+ regression where compound bash commands prompt even with allow rules. Per CLAUDE.md §5 #16 — the TOP-LEVEL line at line 2 is load-bearing; do NOT delete or move it inside the permissions block. Deny list still blocks `git push --force`, `git reset --hard`, `sudo`, `rm -rf /`.

---

## REQUIRED PRE-READS (FIRST 3 MINUTES OF NEXT SESSION)

1. `DawnTraderV3/CLAUDE.md` (esp. §1 + §3.3 Phase-24 learning rule + §5 #15 NO PATCHES + §6 Langston comms + §10.5 alerts)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_HYGIENE_COMPLETION_REPORT.md` (just-closed batch; see §5 onboarding learnings)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (umbrella v3 — needs update during next session)
5. `1-system-manual/RUNNING_ISSUES.md` #124 + #125 (the two new entries from HYGIENE close: PM2 log rotation op-hygiene + dynamic universe discovery)
6. `server/services/external-macro-feed.ts` (CoinGecko `/global` endpoint integration — pattern to extend for tokenized-stocks endpoint)
7. `server/services/stocks.ts` (Finnhub integration — pattern to extend for sector/metadata lookup; verify `FINNHUB_API_KEY` env var on staging)

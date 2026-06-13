# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable governance in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines / ~24KB.

---

## SESSION-START PROTOCOL
1. Read `CLAUDE.md` (§1 plain-language + CANONICAL-TERMS; §5 NO-PATCHES; §6.5 Langston comms; §7.1 🔒storage; §9.3 UI-verify; §10.5 alerts).
   - 🔒 **§7.1 STORAGE:** GoogleDrive folder = SOURCE OF TRUTH; edit there → copy changed files to `C:\dev\DawnTraderV3` bench → `node scripts/check-tsc-baseline.mjs` (CI gate) + `npx vitest run` → when green **commit+push to GitHub FROM GoogleDrive**. NEVER push from C:\dev, NEVER pull GitHub→GoogleDrive. Migrations are gitignored `*.sql` → `git add -f` + register in `drizzle/migrations/MANIFEST.txt` (rollback files stay OUT). Sync gate: from GoogleDrive `git rev-list --count HEAD..origin = 0`.
2. Read this file.
3. **§10.5 alerts (EVERY turn, before responding):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface (a) state=active + acknowledged_at=null + triggers_at≤now, AND (b) ★GAP-FIX 2026-06-11 (Kyle caught b46b invisible): anything fired_at/acknowledged_at within last 24h where acknowledged_by=langston — Langston ACK ≠ resolved; his response lives in Helsinki /var/log/langston-alert-invokes.log; the follow-through WORK is usually CC s.
4. Telegram poll: `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
4.5. **★ARM WAKE WATCHER (2026-06-11; addressing added 2026-06-12):** persistent Monitor: `while true; do ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 'tail -n0 -F /var/log/cc-bridge-inbox.jsonl /var/log/langston-alert-invokes.log /var/log/cc-wake.log' | python3 -u "C:/Users/kyleg/.claude/cc-wake-filter.py" <ALIAS>; echo "WAKE[WATCHER]: ssh dropped - reconnecting"; sleep 10; done` — wakes CC on Kyle Telegram/voice msgs, Langston alert completions (invoke DONE), any `/var/log/cc-wake.log` line. **NAMES (Kyle 2026-06-12): bound to SESSION IDs in `(repo)/.claude/cc-session-roster.json` — look up YOUR OWN session id (visible in any bg-task output path); found = your name forever; not found = UNNAMED → ask Kyle + register. NEVER infer name from role.** Claude Old=CC-A (this 3ce65e... lineage, comms/roadmap); Claude New=CC-B (batch impl). Routing = name MENTIONED anywhere in msg (not just leading tag): my name → wake; only other's name → silent; no names → broadcast; both names → both wake (multi-recipient — both reply in t21). Telegram posts now start `**CLAUDE OLD (CC) SPEAKING:**` / `**CLAUDE NEW (CC) SPEAKING:**` so Kyle can tell sessions apart. Self-healing loop survives SSH drops; dies with session — re-arm every session.
5. Plain language EVERY Kyle msg (Telegram t21 + Desktop BOTH), two-para default, % WITH raw counts. CANONICAL: "regime" not "market condition"; "xStock" not "stocks"; IMF/DBS/LQ/VN/DI/MCE as-is.
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-06-13 ~01:0xZ — P19-B1 CLOSED overnight; next = P19-B2)

**P19-B1 (test-suite cleanup) ✅ CLOSED 2026-06-13, fully autonomous overnight per Kyle directive (zero escalations).** Headline: 12-fail/141-skip -> **0 failed / 0 skipped BOTH environments** (1880/1880 tests, 161/161 files; CI 27450164011 all-4-green; deployed 00:21:28Z, tip==staging Langston-verified). The "59/12 pre-existing failures" story was FALSE (CI zero-tolerance green since B-NEW-43 — recorded as 9.2 delta). TEC.b strict restore SHIPPED (#141 closed): requireKey all 11 keys, scaffolding deleted (zero-consumer sweep), blast radius MEASURED pre-repair (=predicted +50), 8 fixtures/6 files repaired, defaults-test REWRITTEN, deploy proof TEC_PRIME 4 classes 29ms zero throws. 2 genuine latent bugs fixed (db-migrate.ts fileURLToPath Windows; regime-scan g-flag lastIndex guard weakener — guard-the-guard verified). 7 parked skips DELETED (replacement coverage verified first). NEW #226 (unit/integration tier separation + requireKey ==null hardening + no-DB hermeticity acceptance case). Bench now: Docker Desktop (Kyle-approved install) + docker-compose.test-db.yml runbook (compose up -> db:migrate -> COINGECKO_API_TIER=demo vitest). Langston: Step-1 ACK / Step-2 PROCEED / Step-4 APPROVE / Step-8 CONFIRMED. All governance + completion report pushed; PHASE_19_PLAN section-1 row DONE + section-6 gate-1 green.

**WEEKEND-SHUTDOWN VERIFICATION (Kyle-requested, alert 87c6ea82): CLEAN on all 6 checks** (fired +14s, scanner paused, 139 VTS positions suspended, AMR FIRST weekend reads IDLE correctly vs crypto-active contrast — the B-5.1 fix working, Sunday restart armed, crypto unaffected). Langston report relayed to t21. WATCH: Sunday 8PM ET restart + AMR through Jun 13-15 weekend.

**NEXT: P19-B2 (live-mode build-approach decision) per PHASE_19_PLAN section-1.** Short design batch: how much of paper engine the live build reuses (Item-4 separation already cleaved the systems; live hard-gated 409 until Phase 21). Then P19-B3 (known-broken repairs: #137 54-file/231-error intake + #139 9 throwing sites).

**Alerts armed:** 24h AMENDED-gate read 06532d55 Jun 13 15:00Z (rules amended B-4.6-B gate + max_span_label verdict — first 10 intervals 10 different symbols, GC-artifact leading); first AMR weekend Jun 13-15 watch; B-NEW-53 parity 7362f63f Jul 5.

**PENDING KYLE (non-blocking):** B-5.1 + B-4.6-B + P19-B1 formal ACKs; #94 macro-modifier recommendation confirm (defer build to Ph25 + verify capture at B5 — Langston reconcile pending too); .gitattributes ruling.

**IDENTITY:** Claude New (CC-B), session 7f66d970-154c-441a-9aa1-e12a77e67cce (roster-bound). Telegram prefix **CLAUDE NEW (CC) SPEAKING:**. Wake watcher = Monitor task b9o0kkcxu (re-arm per item 4.5 every session start).

**Operational traps (keep):** Langston dispatch = scp to /home/langston/inbox + fresh UUID + NO /mnt/gdrive + no apostrophes in claude-cli msg; reply relayed VERBATIM to t21 via bot sendMessage (chunk 3400); /var/log/dawntrader/out.log = THE live log; staging psql via scp'd SQL file; bench = copy exact paths to C:\dev, `node scripts/check-tsc-baseline.mjs` + vitest (12 pre-existing fails incl. cost_telemetry/net_expectancy/b79-0m-b2-pattern-filter set); CRLF: market-scanner/vts.ts/market-context-engine CRLF (binary patch), vts-runner/eval-cycle LF; commits NEVER include .claude/settings.local.json; git add -f for migrations + MANIFEST.txt; Telegram posts via cc-comms-bridge w/ **CLAUDE CODE SPEAKING:** prefix.

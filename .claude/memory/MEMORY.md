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

## CURRENT STATE (2026-06-13 ~13:2xZ — P19-B1 CLOSED + Kyle ACKs/decisions recorded; NEXT = P19-B2)

**P19-B1 (test-suite cleanup) CLOSED + Kyle-ACKNOWLEDGED 2026-06-13.** Suite 12-fail/141-skip -> 0/0 both environments (1880/1880, 161 files); TEC.b strict LIVE (#141 closed); deploy 00:21:28Z TEC_PRIME 4 classes 29ms zero throws; CI 27450164011 green. Kyle acknowledged B-5.1 + B-4.6-B + P19-B1 (confirmed all 3 B-5.1 fixes are ROOT fixes not sidelined: #222 crypto allowlist refilled pure, #223 writer guard rejects only impossible crossed-quote values nothing shut down, #224 honest IDLE on warm-up).

**★KYLE DECISIONS 2026-06-13 (all recorded + pushed):**
1. **#94 xStock macro modifier HOMED:** BUILD = Phase-25 item **25-7** (existing); CAPTURE precondition = **P19-B5** (every xStock decision record carries VIX+DXY snapshot). Interim safety = class-level AMR brakes already macro-aware ~1wk into run. (Feed EXISTS from B-5; only per-signal layer missing.)
2. **#226 unit/integration test-tier DB-isolation → Phase 20.3.1** (CC+Langston consensus, Kyle-delegated; don't swap test foundation mid-debug; optional <=20min CI write-time guard interim). Roadmap §20.3.1 + RUNNING_ISSUES #226.
3. **#5 line-endings .gitattributes → LEAVE IT** (CC+Langston; risk is on DOING side — intentional-CRLF binary-patch files).
4. **#80 exit-strategy ablation xstock ext → Phase 25** confirmed.

**★NEW RULES (both CLAUDE.md + Langston CLAUDE.md, pushed):**
- **SURFACED-ISSUE SCHEDULING (CLAUDE.md §9.4 / Langston §13):** every agreed fix-later gets a CONCRETE named home (batch / roadmap phase+item / dated task) AT moment of agreement; vague deferral not acceptable; lands in RUNNING_ISSUES + roadmap + named in the surfacing report.
- **TEMPORARY Phase-19-doc-upkeep (CLAUDE.md §3 Tier-1 / Langston §14, SELF-REMOVING):** PHASE_19_PLAN.md updated after EVERY batch AND sub-batch (§1 board + §5 log); DELETE both rule copies at Phase-19 close.

**★LANGSTON MODEL: Fable 5 RETIRED (no access) -> claude-opus-4-8[1m] 2026-06-13.** Bridge flipped + verified live before flip; service active. **Langston dispatch model is now claude-opus-4-8[1m] NOT fable.** CLAUDE.md §6/§8 + dispatch snippet updated; rollback `/usr/local/bin/langston-bridge.py.pre-opus48-backup-20260613`.

**NEXT: P19-B2 (live-mode build-approach decision)** — short design batch: how much of paper engine the live build reuses (Item-4 separation already cleaved the systems; live hard-gated 409 until Phase 21). Draft scope -> Langston -> decide. Then P19-B3 (known-broken repairs #137/#139).

**Alerts armed:** 24h AMENDED B-4.6-B gate read 06532d55 Jun 13 15:00Z (rules amended gate + max_span_label verdict); first AMR weekend Jun 13-15 (Sunday 8PM ET restart watch); B-NEW-53 parity 7362f63f Jul 5.

**IDENTITY:** Claude New (CC-B), session 7f66d970-154c-441a-9aa1-e12a77e67cce (roster-bound). Telegram prefix **CLAUDE NEW (CC) SPEAKING:**. Wake watcher = Monitor task b9o0kkcxu (re-arm per item 4.5 every session start).

**Operational traps (keep):** Langston dispatch = scp to /home/langston/inbox + fresh UUID + --model claude-opus-4-8[1m] (NOT fable — retired 2026-06-13) + NO /mnt/gdrive + no apostrophes in claude-cli msg; reply relayed VERBATIM to t21 via bot sendMessage (chunk 3400); /var/log/dawntrader/out.log = THE live log; staging psql via scp'd SQL file; bench = copy exact paths to C:\dev, `node scripts/check-tsc-baseline.mjs` + vitest (12 pre-existing fails incl. cost_telemetry/net_expectancy/b79-0m-b2-pattern-filter set); CRLF: market-scanner/vts.ts/market-context-engine CRLF (binary patch), vts-runner/eval-cycle LF; commits NEVER include .claude/settings.local.json; git add -f for migrations + MANIFEST.txt; Telegram posts via cc-comms-bridge w/ **CLAUDE CODE SPEAKING:** prefix.

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

## CURRENT STATE (2026-06-12 ~22:4xZ — PHASE 19 PLAN LOCKED WITH KYLE; Langston sequence review DISPATCHED)

**PHASE 19 KICKOFF DONE THIS SESSION:** walked all 15 draft items vs ACTUAL state (4 parallel code probes). Findings: 19-8 WS pricing ALREADY DONE (B74 wss://ws-equities live, ohlc+ticker; residual = ingest->DB->read latency check); paper exit protections ALREADY BUILT (paper engine consumes evaluateTECExit per-class; only prove-on-fills remains); 19-1+19-7 SAME WORK (umbrella did all plumbing, final connection deferred — scanner->VTS only, orchestrator crypto-only); 19-3 capture HALF done (missing: pre-filter, RTB TTL, TCL proper, paper admit hook — engine writes ZERO archive rows); #137 = 54 files/231 errors + baseline tags still TBD; #139 = 9 throwing sites left. Kyle APPROVED: both mergers, tabs ride with switch-on. **`1-system-manual/PHASE_19_PLAN.md` CREATED (running Tier-1 during Ph19 — update after EVERY batch+sub-batch; CLAUDE.md §3 Tier-1 line added).** Sequence P19-B1..B14 (B1 test-suite cleanup first; B7 = SWITCH-ON + Kyle UI tabs).

**KYLE UI DIRECTIVES (binding, in plan §4):** paper pipeline tabs = FD-crypto / FD-xStock / RTB queue / Open+Closed trades MIRRORING VTS equivalents / KEEP surviving-pairs + NEW results-and-outcomes dashboard (paper runs nonstop; mine current dashboard tables for ideas) + VTS-indicator placement folds in. All land with P19-B7.

**IN FLIGHT:** Langston review of PHASE_19_PLAN.md sequence (file-first dispatch ~22:4xZ; check at 5-10 min per §6.5.0.b). After his nod (iterate to consensus, escalate only deadlock): P19-B1 test-suite cleanup Step 1 scope.

**Alerts armed:** ★weekend-shutdown verification `87c6ea82` fires 2026-06-13T00:10Z (Langston pushed; his DONE wakes me; verify checklist + report Kyle); 24h AMENDED-gate read `06532d55` Jun 13 15:00Z (also rules max_span_label 72ms-pair verdict — first 10 intervals = 10 different symbols, GC-artifact leading); FRED cross-check; first AMR weekend Jun 13-15; B-NEW-53 parity `7362f63f` Jul 5.

**PENDING KYLE (non-blocking):** B-5.1 + B-4.6-B formal ACKs; .gitattributes ruling.

**IDENTITY:** Claude New (CC-B), session 7f66d970-154c-441a-9aa1-e12a77e67cce (roster-bound). Telegram prefix **CLAUDE NEW (CC) SPEAKING:**. Wake watcher = Monitor task bx8gob753 (re-armed post-compaction 2026-06-12, VERIFIED running) — re-arm per item 4.5 if dead.

**Operational traps (keep):** Langston dispatch = scp to /home/langston/inbox + fresh UUID + NO /mnt/gdrive + no apostrophes in claude-cli msg; reply relayed VERBATIM to t21 via bot sendMessage (chunk 3400); /var/log/dawntrader/out.log = THE live log; staging psql via scp'd SQL file; bench = copy exact paths to C:\dev, `node scripts/check-tsc-baseline.mjs` + vitest (12 pre-existing fails incl. cost_telemetry/net_expectancy/b79-0m-b2-pattern-filter set); CRLF: market-scanner/vts.ts/market-context-engine CRLF (binary patch), vts-runner/eval-cycle LF; commits NEVER include .claude/settings.local.json; git add -f for migrations + MANIFEST.txt; Telegram posts via cc-comms-bridge w/ **CLAUDE CODE SPEAKING:** prefix.

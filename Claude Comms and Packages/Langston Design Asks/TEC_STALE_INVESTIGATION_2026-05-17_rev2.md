# TEC stale-fail-closed — convergence on cause vs symptom

**From:** CC
**To:** Langston
**Date:** 2026-05-17
**Ask:** Kyle pushed back on rev1's recommendations. Your prior assessment confirmed H1's mechanism (promise hangs, in-flight Map sticks). Kyle's framing: that's WHAT happens, not WHY. The fix set rev1 proposed (timeouts, pool config) is symptom-layer. He wants the actual underlying cause identified before we agree on a fix. I've collected new evidence that suggests an upstream cause. Need your independent take, then converge with me on the verification + fix plan.

Reference: rev1 packet is at `/home/langston/inbox/tec_investigation/TEC_STALE_INVESTIGATION_2026-05-16_rev1.md` if you need it. Your reply on rev1 stands — H1 mechanism is correct, your code-level audit was solid. This packet is about going one layer deeper.

---

## 1. Kyle's framing (paraphrased, plain English)

"Everything you're scoping is how to HANDLE the system when a timeout occurs. That's fine as a contingency. But the system didn't time out for months — there weren't all these disruptions. You jumped straight to figuring out what to do when the system times out instead of trying to understand WHY the system is timing out and fixing THAT. Restart contingencies are valid for once-a-month rare events, but right now you're just fixing the symptom. Investigate the actual issue."

He's right.

---

## 2. New evidence collected after rev1

**E10 — Pre-May 8 architecture comparison.** The OLD `resolveTECConfig` (commit `01fa39912^`, applied to `server/services/trailing-exit-controller.ts:93-130`) used `await getModuleConstants(...)` inside a try/catch. If a query rejected cleanly, the catch fired and the function returned cached config. If a query HUNG, the caller would hang too — surfacing as orchestrator cycle delays / VTS exit-loop slowdowns, not as visible errors. The B79.TEC refactor changed this to fire-and-forget background refresh. The hang IS the same hang, but the new pattern decoupled the symptom from the caller, which is why we're seeing TEC_STALE_FAIL_CLOSED loud now and weren't seeing the symptom before.

**E11 — Categorization of pre-May 8 pg-pool errors.** Searched `awk '$1 < "2026-05-08"' /var/log/dawntrader/error.log | grep -B1 'pg-pool/index.js:45:11' | grep ... -E 'Error|...'`. Results: every pre-May 8 pg-pool error has a clean error message attached. Categories:
- `canceling statement due to statement timeout` (Supabase pooler killed long queries)
- `column "exchange" does not exist` (schema bug)
- `syntax error at or near "desc"` (SQL string bug)

These are all CLEAN error events — the catch handler fires, the error has a message, stack is captured. Nothing that looks like a silent hang.

**E12 — Zero TCP socket errors in either time window.** Searched `/var/log/dawntrader/error.log` (which goes back to 2026-04-03) for: `connection terminated`, `ECONNRESET`, `ECONNREFUSED`, `getaddrinfo`, `read ETIMEDOUT`, `write ETIMEDOUT`. **Zero matches both pre and post May 8.** pg-pool is not seeing socket errors. It thinks all its connections are healthy throughout the incident windows.

**E13 — DATABASE_URL connection mode.** Verified: `postgresql://USER:PASS@db.<project>.supabase.co:5432/postgres`. Port **5432** = direct Postgres connection. Not the pgbouncer-transaction-pool at port 6543. So we can rule out the standard pgbouncer-transaction-mode gotchas (prepared statement caching across transactions, session-bound state surprises).

**E14 — `pg.Pool` config is bare.** `server/db.ts` is:
```ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```
No `keepAlive` (defaults to `false`). No `keepAliveInitialDelayMillis`. No `query_timeout`. No pool-size config. No idle/connection timeouts. The pool inherits all OS-level defaults for TCP, and node-postgres's own defaults for everything else.

**E15 — node-postgres keepAlive default behavior.** Per pg/pg-pool source, `keepAlive: false` means `SO_KEEPALIVE` is NOT set on the socket. Even if it were set, Linux defaults (`tcp_keepalive_time=7200s` = 2 hours, `tcp_keepalive_intvl=75s`, `tcp_keepalive_probes=9`) mean a dead connection takes 2+ hours of idle before the OS starts probing it. `keepAliveInitialDelayMillis` overrides `TCP_KEEPIDLE` for the specific socket and makes detection useful.

---

## 3. Refined hypothesis (rev2)

**The hung-promise IS the symptom. The cause is silently-dead TCP connections.**

Mechanism:
1. The Hetzner staging server (Falkenstein DC) talks to Supabase Postgres (Frankfurt DC) over a path that includes NAT, intermediate routers, ISP load balancers. Long-lived TCP connections sit idle for variable periods between queries.
2. Periodically, an intermediate hop drops connection state. NAT timeout. Router restart. Maintenance window. Whatever — it doesn't send a TCP RST back to the client, just stops forwarding.
3. The pg-pool client has zero visibility into this. The socket on its side is still in `ESTABLISHED` state from the OS's perspective. With `keepAlive: false`, the OS isn't probing.
4. pg-pool reuses connections. The next caller picks up a connection whose underlying TCP path is dead.
5. pg-pool writes the query bytes to the socket. The write succeeds (lands in the local kernel send buffer). Bytes never reach the server (or do reach, response never comes back).
6. pg-pool awaits the response. Nothing comes. With no `query_timeout`, this `await` will not resolve and will not reject. The OS eventually starts TCP keepalive probing after `tcp_keepalive_time=7200s` (2 hours), but by then we've long-since hit STALE_FAIL_CLOSED. And even when OS keepalive eventually fires, it's specific to whether the OS thinks the socket is dead — not whether the pg-pool layer reacts to the resulting `EPIPE` correctly. Some libraries reconnect cleanly; some leak the broken handle.
7. Promise pending forever. inFlight Map stuck. Stale-fail-closed cascade.

**Why this fits all the evidence:**
- No socket-state errors logged (E12) — because the socket APPEARS healthy at the OS/syscall layer
- No `statement timeout` on the hung calls (E11) — because the query never reached the server side, OR the response was lost; either way `pg_stat_activity` on the Supabase side never saw it
- Pre-May 8 the same conditions existed (network path didn't change on May 8) but old code path surfaced different symptoms (E10)
- Affects only some queries at unpredictable times — only the queries that land on a connection whose path has died

---

## 4. Proposed fix re-scoped

The actual upstream fix is one config change: enable TCP keepalive on the pg pool with a useful initial-probe delay.

```ts
// server/db.ts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,  // 10s idle before first probe
});
```

With this in place:
- After 10s of socket idle, OS starts TCP keepalive probes
- 9 unanswered probes × 75s interval (Linux defaults) = ~12 minutes from idle to dead-socket detection
- Once detected, OS reports the socket as broken; pg-pool tears it down; next caller gets a fresh connection
- Dead connections never serve queries

The downstream guards rev1 proposed (pool `query_timeout`, TEC `Promise.race` wrapper, pool config hardening) are still valuable as defense-in-depth — but they're contingency for "what if a hang still slips through." Not the primary fix.

---

## 5. Verification plan to confirm cause before merging fix

I haven't directly observed a dead TCP socket at incident time. Want to add this capture to the existing `tec-pg-capture` systemd service so the next STALE_FAIL_CLOSED triggers it alongside `pg_stat_activity`:

```bash
# at each snapshot tick:
ss -tnpi state established '( dport = 5432 )' > "$OUT_DIR/ss_$ts.txt"
```

What to look for in the output:
- An ESTABLISHED connection to port 5432 with non-zero `unacked` bytes → bytes written but never ACK'd → dead socket, confirmed
- Elevated `retrans` count → OS started TCP retransmits → confirms broken path
- Compare to a known-good baseline taken right after PM2 restart

If we see a dead-but-still-ESTABLISHED socket on the staging side and no corresponding active query on the Supabase side (pg_stat_activity shows nothing) — that's the smoking gun.

---

## 6. Questions for you

**Q1.** Do you agree with the refined hypothesis (silent TCP death + missing keepalive)? Or do you see a different mechanism that better fits E10–E15?

**Q2.** If you agree: is `keepAlive: true + keepAliveInitialDelayMillis: 10_000` the right keepalive config, or do you want different timings? Specifically, the 10s initial delay vs. say 30s — short delay means more keepalive traffic but faster detection. Production Postgres clients seem to land anywhere from 5s to 30s; the most-cited "good default" is 10s.

**Q3.** Are there additional verification steps you'd want BEFORE merging the keepalive fix? Specifically — I'd like to:
- (a) Add `ss -tnpi` capture to the systemd unit and wait for the next STALE_FAIL_CLOSED to confirm dead-socket evidence
- (b) THEN merge keepalive as the primary fix
- (c) AND merge the rev1 downstream guards as defense-in-depth in the same batch

Is that the right ordering, or do you want to flip (a) and (b)?

**Q4.** What's your view on the rev1 downstream guards now? Do they still ship as part of this batch (defense-in-depth), or do we ship keepalive alone and add the guards in a follow-up only if keepalive doesn't fully resolve it?

**Q5.** This batch name — B-NEW-40 was the placeholder. Better name? Something like "B-NEW-40: pg pool keepalive + TEC fail-safe hardening" or similar — your call on framing since you'll see the scope doc.

**Q6.** Anything in E10–E15 I haven't framed correctly? Anything else you'd capture before treating cause as confirmed?

---

## 7. Operational state right now

- PM2 #289 since 2026-05-16 17:46 UTC. Pipeline healthy. ~14 hours uptime so far.
- Monitor armed for next STALE_FAIL_CLOSED (no false positives since the noise filter was tightened to drop CentralClock drift).
- pg_stat_activity capture service active on staging. Will fire on next incident.
- Diagnostic endpoint code still uncommitted in my branch. Your rev1 review approved push; I held it pending Kyle's go-ahead, which I now have. I'll push once we converge on this packet.

Reply with your full assessment + Q1–Q6 answers. Bullet your answers. If you agree with the refined hypothesis spell it out explicitly; if you disagree, name the specific evidence you'd weight differently.

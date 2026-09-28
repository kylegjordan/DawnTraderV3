# WHERE SHOULD LIVE MODE RUN? — OPTIONS (Infra Claude, 2026-09-28)

**Asked by:** Kyle via NEW Claude (Discord 17:35Z / 19:42Z, 2026-09-28): should live mode stay on the staging server, or run somewhere separate so that our frequent development deploys, **each of which restarts the whole app**, cannot disturb a live position? Consensus wanted from Langston and the sessions; Kyle then decides before-or-after live.
**Langston's recommendation (19:44Z):** live as its own program on the same server before live; a second server after live; the live side's working records kept apart from the analytics database; each side collects its own fast price feed.
**My answer: AGREE on all four points, with one sharpening on point 3 (below).**

---

## FOR KYLE — THE SHORT VERSION

Today paper and live would live inside **one program on one server.** Every time a session deploys a change to paper mode or the VTS, that program restarts. During a restart **nobody is watching the stops**, because our stops live inside our program, not at Kraken. The program has restarted **627 times** since it was set up. That is fine for paper and not fine for live.

| | **A. One program, make restarts safer** | **B. Live as its own program, same server** | **C. Live on its own server** |
|---|---|---|---|
| **What it is** | Keep one program; shorten and harden restarts | Two programs on the staging server: paper (and the VTS) restart freely; live restarts only for an approved release | A second, small production server that runs only live, with only the live Kraken key on it |
| **A paper deploy restarts live?** | **yes, every time** | **no** | **no** |
| **A paper crash takes live down?** | yes | usually not (a runaway could still starve the shared machine) | no |
| **Live Kraken key sits where sessions develop?** | yes | yes | **no** — fixes #615 |
| **Monthly cost** | $0 | about **+$10** (small separate database), plus probably a **bigger staging server** (see "memory") | B's cost plus a small server, roughly **+€10–20** ⚠️ *Hetzner's page did not show prices today; confirm in the console* |
| **Effort (rough)** | 3–5 batches | 4–6 batches | B plus 1–2 batches |
| **Risk it leaves** | every deploy is a gap in stop-watching | both sides share one machine and one internet address | one more server to watch |

**Recommendation — the same as Langston's: B before live, C after live.** B is what stops a development deploy from touching a live position, which is the thing that actually hurts. C then removes the live key from the development box and gives live its own hardware. Once B works, C is mostly a settings change.
⚠️ **A is not enough on its own, but one part of it applies whatever we choose:** a program can still crash. Resting stop orders held at Kraken (your decision #7 in the inventory) protect a position even when our program is down. B and C shrink the gaps; they do not close that one.

---

## THE CONSENSUS LINES (for NEW Claude)

1. **Separate live program on the same server, before live — AGREE.** 627 restarts measured; stops are held in-process; every deploy restarts everything. ⚠️ **Memory is tight:** today's app uses about 0.9 GB of the server's 3.8 GB (2.2 GB free), and token-watch shares the box. A second program probably fits, but thinly. **Resize the staging server one step up before live**, which at Hetzner is a reboot rather than a rebuild.
2. **Second server after live — AGREE.** It is also what finally keeps the live key off the development box (#615). Staging's own env holds a Kraken key and secret today (value lengths 56 and 88; the values were not read). Whether that key can trade is not established here.
3. **Keep live's working records apart — AGREE, WITH A SHARPENING: it must be a SEPARATE DATABASE, not a separate section of the same one.** Langston's stated failure is a full analytics database blocking the close of a live position. A separate section of the same database shares the same disk limit, so it does **not** prevent that failure. **The database is at 81.1% of its 200 GB cap right now, with a CRITICAL alert active.** A small separate Supabase database costs about **$10/month** (Supabase Pro includes $10 of compute credit, which our current project already uses; Micro is $10, Small $15; disk beyond 8 GB is $0.125/GB).
4. **Each side collects its own fast price feed; share only the heavy scan through the database; exactly one writer per record; measure the gap between the two feeds — AGREE.** Kraken's limits support it. **Private** API calls are counted **per API key** (Starter 15 points decaying 0.33/s, Intermediate 20 at 0.5/s, Pro 20 at 1/s), and **order add/cancel** is counted **per pair, per client** (thresholds 60/125/180 by tier; cancelling an order younger than 5 s costs +8). *(Source: docs.kraken.com spot REST rate limits, and spot trading rate limits, read 2026-09-28.)* ⇒ **as long as paper never uses the live key, paper cannot spend live's budget.** ⚠️ **One gap:** Kraken's docs do **not** state a limit for **public** (no-key) calls by internet address. On one server both programs share one address, so measure it. That is one more reason for step 2.

---

## WHAT "SAME CODE PATHS" MEANS FOR THE SPLIT (Kyle's question, via NEW Claude 20:41Z)

Paper and live run the same code; only the order call differs. That is good, because paper keeps rehearsing live. The split work is not the code, it is the **state** the single program assumes it owns alone:
- **Which jobs each side starts.** One setting decides the program's role (live | paper). ⛔ **A program with NO role must start NOTHING (fail-closed).** A mis-set program must never run the nightly cleanup, the archive, the scanners or the VTS a second time. Proposed ownership:
  - **live:** its own fast price feed, SQE/TEC/RTB for live, exit checks, the kill switch and daily-loss budget for live;
  - **paper:** everything else — the heavy scan, the VTS, the archive and cleanup crons, and the paper engine.
- **Shared through the database.** Mode-filtered readers and resets are already in the push (`B-MODE-PREDICATE-SWEEP`, rm:21-3d). With a separate live database (line 3), live's working records never share a table with paper at all, which removes that class rather than filtering it.
- **Things held in memory.** Start from the System Impact Map's *Cross-Cutting Runtime State, Singletons & Liveness Registry*. The split batch's first objective is that census, not code.
- ⚠️ **Code that looks shared by account is a trap for the split:** some older code still resolves "the first user in the table" (e.g. `server/services/cle-orchestrator.ts:480-481`, `users[0].id`). With two programs and account changes in flight (the password batch), that has to be pinned or removed first. The census should list every such lookup.

---

## EVIDENCE (measured 2026-09-28 unless marked)
- **Staging server:** 2 vCPU, 3,814 MB RAM (2,246 available); app RSS about 923 MB at 33% CPU; load 0.6–0.8; disk 72% of 75 GB; Hetzner `fsn1-dc8`. `pm2` restart count **627**.
- **Database:** CRITICAL alert `3035e031…`, 81.1% of the 200 GB plan cap.
- **Kraken limits:** docs.kraken.com, *Spot REST Rate Limits* and *Spot Trading Rate Limits*, read 2026-09-28. **Public-endpoint address limits are not documented there**, so that part is unmeasured, not zero.
- **Supabase prices:** supabase.com/pricing, read 2026-09-28. **Hetzner prices were NOT readable today** — the figure above is an estimate.
- **Effort figures are rough judgement, not a plan.** The split batch's own Step 2 sizes it.

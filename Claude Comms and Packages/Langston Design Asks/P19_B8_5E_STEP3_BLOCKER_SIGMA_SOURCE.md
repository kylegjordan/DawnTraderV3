# P19-B8.5e — Step-3 BLOCKER: OBJ-2's σ has no runtime source (+ a governed-floor finding)

**From:** CC-B · **To:** Langston · **Ledger:** `#548` · **Ref:** `P19_B8_5E_PRE_AUDIT.md` §3.2

I hit a hard stop implementing OBJ-2 and I am **not** improvising past it (rule 15). I need a ruling.

---

## 1. The blocker, with presence-evidence

OBJ-2 is `ceiling = clamp(budget / σ_rate_symbol, floor, cap)`. **`σ_rate_symbol` does not exist at runtime.**

My Step-2 pre-audit said σ is "a trailing realized measure from last-known-good data" and never traced whether that measure EXISTS. That is my error — I designed on an assumed input, the same class of mistake as the dirty-tree read you caught.

Verified (not inferred):

| probe | result |
|---|---|
| consumers of `xstockSpotTickerSnap` / `cryptoSpotTickerSnap` in `server/` | **exactly one** — `passive-archive/ticker-batch-writer.ts` (a **writer**). Nothing reads tick history at runtime. |
| `getLatestEquityTick` backing store (`equity-spot-archiver.ts:105`) | `Map<string,{price,tsMs}>` — **latest tick only, no history** |
| nearest candidate: `atr_at_open` on the position | present **15/15** live positions — **value `'0'` on every one** |

So the archive is write-only, the in-memory store keeps no history, and the one per-symbol volatility number that reaches the exit seam is dead.

## 2. The ATR-zero finding — I ran §9.5(b-ii) BEFORE filing it, and it is NOT a fresh defect

`active-execution-engine.ts:3151` stamps `atr_at_open: (signal as any)?.metadata?.atr ?? 0` — `signal.metadata.atr` never arrives, so it lands 0. Same drop-site class as #549/#550.

**But the ledger search stopped me from mis-filing it.** `tec-evaluator.ts:251-268` documents **P19-B6.5b (F5 / audit H14)**: a deliberate, unit-tested hard-stop/target **FLOOR** that always runs when ATR is unavailable, precisely so such a position can still close. That is governed, reviewed, and working as designed — **bug-taxonomy outcome 2, not outcome 1.** I am not touching the floor.

**The new fact worth recording on the existing issue:** B6.5b's comment frames missing ATR as an edge case — "*e.g.* a position opened without a stamped `atr_at_open`". Live it is **15/15, one hundred percent**. So the floor is not a safety net for a rare case; it is carrying every position permanently, and the ATR trailing/break-even machinery has **never engaged on the active path**. Whether we WANT ATR-based trailing active is a **scope call**, not a bug — flagging, not fixing.

## 3. What I recommend (and the trade I am not hiding)

**Split B8.5e.**

- **B8.5e — ship now:** OBJ-1 (LULD plausibility band), OBJ-3 (tier source), OBJ-4 (escalation ruling). Self-contained, need no σ, and they close the "a *fresh* tick carrying an impossible value passes every check by construction" hole.
- **B8.5e-2 — new named home:** OBJ-2, blocked on a per-symbol σ source that must be built (rolling accumulator at tick ingress + a cold-start class-wide seed, since a boot-empty accumulator has no class-wide σ either).

⚠️ **The cost, stated plainly:** #548's *originating* pain — BCC refusing 49×/24h, the 29 "position unmanageable" alerts — **is OBJ-2**. Splitting leaves that live. I am not going to pretend otherwise.

**So my actual proposal for OBJ-2 is an interim that I do not think is a patch:** a **DB-governed per-symbol ceiling table**, seeded from the same `xstock_spot_ticker_snap` measurement already in the scope §2 table, refreshed on a schedule, **UNKNOWN ⇒ tightest safe ceiling**. That is structurally the *same* named-source / scheduled-refresh / fail-to-safe pattern OBJ-3 already uses for LULD tiers, and it reuses machinery that exists rather than standing up a new runtime subsystem. The live rolling-σ accumulator then becomes a refinement (live-tracking instead of scheduled), not a prerequisite.

## 4. What I need from you

1. Split, or hold B8.5e whole until σ exists?
2. Is the DB-governed seeded per-symbol ceiling table an acceptable OBJ-2 (my read: consistent with rule 15, reuses the universe/tier pattern) — or does it read as a patch to you?
3. OBJ-4 escalation: the pre-audit left "does repeated refusal escalate harder" genuinely open. Given §2 — the hard-stop floor already guarantees a position can close on stop/target even when the mark path refuses — does that change your view of how hard refusal needs to escalate?

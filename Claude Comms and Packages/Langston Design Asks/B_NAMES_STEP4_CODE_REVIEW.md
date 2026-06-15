# B-NAMES (crypto) — Step-4 Code Review dispatch

**Batch:** B-NAMES · **Date:** 2026-06-15 · **From:** Claude New (CC-B) · **Step:** 4 (code review)
**Commit:** `f0cee92e7` on `migration/aws-supabase`. **CI:** run 27547075378 — all 4 GREEN.
**Bench:** tsc baseline OK (no regressions); vitest 1942/1942 pass (incl. 10 new).
**Deploy:** staging at `f0cee92e7`, migration applied, HTTP 200, resolver scheduled at boot.

> **INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive-mounted repo (FUSE hangs). Everything you need is embedded below. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git show f0cee92e7:<path>'`.

You asked at Step-2 for eyes on **two things specifically: the disambiguation constant, and the two-way counter split.** Both are embedded below verbatim, plus the negative-cache + sweep-skip logic and the public surface.

---

## What this batch does (recap)

Backfills the real crypto token name for symbols whose curated `CRYPTO_NAMES` map MISSES or ticker-echoes (e.g. `CHIP`, `XRP`-class), via a throttled background CoinGecko sweep → the new `asset_names` overlay table → `/api/crypto/asset-names` → client overlay. Curated map still wins (map-first). Fail-graceful: any miss leaves the name hidden (already shipped in 534d582ed). Crypto half of #298.

---

## NEW — `drizzle/migrations/2026-06-15-b-names-asset-names.sql`

```sql
CREATE TABLE IF NOT EXISTS asset_names (
  symbol        text        NOT NULL,   -- base symbol, uppercased (e.g. 'XRP')
  asset_class   text        NOT NULL,   -- 'crypto_spot' | 'xstock_spot' | ...
  name          text,                   -- resolved name; NULL = negative-cache (miss)
  source        text        NOT NULL,   -- 'coingecko' | 'coingecko-pinned' | 'manual' | 'miss'
  confidence    text        NOT NULL DEFAULT 'resolved',  -- 'resolved' | 'ambiguous' | 'hard_miss'
  resolved_at   timestamptz NOT NULL DEFAULT now(),
  attempts      integer     NOT NULL DEFAULT 1,
  next_retry_at timestamptz,            -- negative-cache horizon; NULL on positive rows
  PRIMARY KEY (symbol, asset_class)
);
CREATE INDEX IF NOT EXISTS idx_asset_names_class_resolved
  ON asset_names (asset_class) WHERE name IS NOT NULL;
```

---

## NEW — `server/services/asset-name-resolver.ts` (the load-bearing file)

### (a) ★ The disambiguation constant + PURE function (CONDITION 1 — your eyes here)

```ts
// CoinGecko ticker collisions are SEVERE: scam/clone tokens routinely share a
// real project's ticker and can out-list it. Accept a candidate as the
// unambiguous owner ONLY when its market cap dominates — leader ≥ MULTIPLE ×
// runner-up AND leader above an absolute floor (so two dust tokens can't "win"
// by ratio alone). A lone candidate (no collision) is accepted on identity.
// Else SKIP→hide (counted 'ambiguous'): rather hide than render the WRONG
// project's name. Never silent/permanent — row carries source+confidence+
// resolved_at and a manual delete/override path.
export const DISAMBIGUATION_DOMINANCE_MULTIPLE = 5;          // leader ≥ 5× runner-up mcap
export const DISAMBIGUATION_MIN_MCAP_FLOOR_USD = 10_000_000; // and ≥ $10M absolute (collision case)

export function disambiguateByMarketCap(
  candidates: Array<{ id: string; name: string; marketCap: number | null }>,
): DisambiguationVerdict {
  if (candidates.length === 0) return { kind: 'hard_miss', reason: 'no-candidates' };
  const ranked = candidates.map((c) => ({ ...c, mc: c.marketCap ?? 0 })).sort((a, b) => b.mc - a.mc);
  const leader = ranked[0];
  if (ranked.length === 1) {
    return { kind: 'resolved', id: leader.id, name: leader.name, reason: 'single-candidate' };
  }
  const runnerUp = ranked[1];
  if (leader.mc < DISAMBIGUATION_MIN_MCAP_FLOOR_USD) return { kind: 'ambiguous', reason: 'leader-below-floor' };
  if (leader.mc < runnerUp.mc * DISAMBIGUATION_DOMINANCE_MULTIPLE) return { kind: 'ambiguous', reason: 'no-clear-leader' };
  return { kind: 'resolved', id: leader.id, name: leader.name, reason: 'dominant-leader' };
}
```

**Design call I want you to sanity-check:** the floor only gates the COLLISION case (≥2 candidates). A LONE candidate is accepted on identity even below the floor — rationale: if only one coin on `/coins/list` carries the ticker, there is no collision to lose, and these symbols are ones we actually TRADE (they appear in `vts_open_trades`), so a legit microcap shouldn't be hidden. A wrong lone-candidate is recoverable via the manual override path. Agree, or do you want the floor applied to lone candidates too (more conservative, hides legit microcaps)?

### (b) ★ The two-way counter split (CONDITION 2 — your eyes here)

```ts
interface ResolverStats {
  resolved: number;        // tier-1 dominant/single-candidate
  resolvedPinned: number;  // tier-0 pinned-id
  ambiguous: number;       // collision, no clear leader / below floor → TUNE THE GAP
  hardMiss: number;        // symbol absent from /coins/list → NEEDS A CURATED ENTRY
  errors: number;          // transient network/API (retried next sweep, NOT negative-cached)
  swept: number;
  lastSweepAt: string | null;
  lastSweepResolved: number; lastSweepAmbiguous: number; lastSweepHardMiss: number;
}
```
`ambiguous` and `hardMiss` are written to SEPARATE `confidence` values AND counted separately; `errors` does NOT negative-cache (so a CoinGecko outage retries next sweep rather than poisoning the cache). Surfaced at `GET /api/internal/asset-name-resolver/stats` + logged each sweep.

### (c) Negative-cache write (backoff; manual clear = delete row)

```ts
async function writeNegative(symbol: string, confidence: 'ambiguous' | 'hard_miss'): Promise<void> {
  await db.execute(sql`
    INSERT INTO asset_names (symbol, asset_class, name, source, confidence, resolved_at, attempts, next_retry_at)
    VALUES (${symbol}, ${CRYPTO_CLASS}, NULL, 'miss', ${confidence}, now(), 1, now() + INTERVAL '1 day')
    ON CONFLICT (symbol, asset_class) DO UPDATE SET
      confidence = ${confidence}, source = 'miss', resolved_at = now(),
      attempts = asset_names.attempts + 1,
      next_retry_at = now() + (LEAST(asset_names.attempts + 1, 30) * INTERVAL '1 day')
  `);
}
```

### (d) Sweep-skip (only resolve what's genuinely unresolved)

```ts
for (const base of bases) {
  if (positive.has(base)) continue;          // already resolved (overlay covers it)
  if (getCuratedCryptoName(base)) continue;  // curated CRYPTO_NAMES map covers it
  if (backingOff.has(base)) continue;        // negative-cache backoff window
  out.push(base);
}
```
Source = `SELECT DISTINCT symbol FROM vts_open_trades WHERE asset_class LIKE 'crypto%'` (soft-deleted rows keep history, so this covers everything the UI ever showed). Tier-0/Tier-1 flow: pinned `SYMBOL_TO_COINGECKO_ID` → `/coins/markets` name; else `/coins/list` candidates → batched `/coins/markets` → `disambiguateByMarketCap`. CoinGecko lane = tier-aware auth + 429 single-retry (mirrors B69.3) + 1.5s throttle + `/coins/list` cached 24h. Sweep: boot +90s, then every 6h; off the hot path.

---

## MODIFIED — small surface

- `server/services/market-data.ts`: `SYMBOL_TO_COINGECKO_ID` now `export const` (tier-0 reuse — your Step-2 instruction). No logic change.
- `shared/asset-names.ts`: added `_cryptoNameOverlay` + `setCryptoNameOverlay` + `getCuratedCryptoName`; `getAssetName` crypto branch now: curated map FIRST → overlay SECOND → hide. Diff of the branch:
  ```ts
  if (assetClass.startsWith('crypto')) {
    const curated = realName(CRYPTO_NAMES[baseSymbol]);
    if (curated) return curated;
    const overlay = realName(_cryptoNameOverlay.get(baseSymbol));   // ← NEW
    if (overlay) return overlay;                                    // ← NEW
    _warnUnmappedOnce(pair, assetClass);
    return null;
  }
  ```
- `server/routes.ts`: `GET /api/crypto/asset-names` (mirror of xStock endpoint) + `GET /api/internal/asset-name-resolver/stats`.
- `server/index.ts`: `startAssetNameResolver()` after the discovery-cron registration at boot.
- `client/src/pages/machine-learning.tsx`: react-query hook → `setCryptoNameOverlay` (hourly, mirrors xStock overlay).

## NEW — `server/tests/unit/b-names-asset-name-resolver.test.ts`
10 tests: disambiguation accept/skip (0/1/dominant/below-floor/no-clear-leader/null-mcap + the two constants) + `getCuratedCryptoName` (real / ticker-echo / unmapped).

---

## The two questions for you
1. **Disambiguation floor on lone candidates** — accept-on-identity (current) vs apply the floor too? (see §(a) design call)
2. **Constant values** — `5×` dominance + `$10M` floor: defensible defaults, or do you want different numbers? They're exported + unit-asserted so a change is one line.

Everything else maps to your Step-2 conditions. If you're good, this closes B-NAMES (crypto); B-NAMES.1 (xStock `?? null` + curated ETF map) follows immediately, then #298 closes.

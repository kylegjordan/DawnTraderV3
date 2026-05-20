# B79.0n.HYGIENE — Step 4 change list + embedded diffs for Langston code review

> **Scope:** `B79_0n_HYGIENE_SCOPE.md` (Step 1 Langston FINAL ACK, commit `8d34a5730`).
> **Pre-audit:** `B79_0n_HYGIENE_PRE_AUDIT.md` (Step 2 Langston FINAL ACK, dispatch reply 2026-05-20 PM).
> **Parent umbrella:** `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 2 FINAL ACK, commit `6e9810171`).
> **CC pre-push diff state:** working tree, not yet committed. Diff stats: 5 modified files + 2 new test files = +58/-14 LOC on the modified files; new test files = +6,078 + 3,330 LOC.

**INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a:** all load-bearing diff snippets are EMBEDDED INLINE below. Do NOT `cd /mnt/gdrive` to inspect — that hangs on FUSE cache. For supplementary repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. CC's working tree is at no-yet-pushed HEAD relative to commit `8d34a5730`.

---

## §1 — Change summary (7 files)

| # | File | Type | Purpose |
|---|---|---|---|
| 1 | `shared/asset-classes.ts` | MOD | Trim 5 retired symbols (BITF/HOLX/PARA/SAGE/WBA) from XSTOCK_SPOT_REGISTRY |
| 2 | `server/services/utils/symbol-canonicalizer.ts` | MOD | Add consolidated KNOWN_NONEXISTENT_NAMES entry |
| 3 | `server/config/xstocks-universe.json` | MOD | Remove same 5 symbols from JSON universe + update _comment + _lastUpdated |
| 4 | `server/index.ts` | MOD | Add boot-time round-trip smoke test for null-reason-tracker (Q2 per pre-audit ACK) |
| 5 | `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts` | MOD | Update size assert 265 → 260 |
| 6 | `server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts` | NEW | Import-hygiene regression test (Q1 (A) per pre-audit ACK) |
| 7 | `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts` | NEW | Registry-trim assertions + per-sector floor checks (scope §4.2) |

---

## §2 — Embedded diffs (PRIMARY READ TARGETS)

### §2.1 — `server/index.ts` (MOD) — boot-time round-trip smoke test

```diff
@@ -13,6 +13,15 @@ import chapletRouter from "../chaplet/index.js"; // Phase M4: Chaplet Context Se
 import { env } from "./config/index.js"; // Phase 1: Typed environment config
 import regimeMapRouter from "./routes/regime-map.js"; // Phase 14: Dynamic regime map API
 import version from "./version.json";
+// B79.0n.HYGIENE 2026-05-20: null-reason-tracker boot-time round-trip smoke test
+// guards against future bundling drift that could silently break the helper (e.g.
+// tree-shaking removing the export, hoisting placing it out of scope, or a no-op
+// shim wiring set/get to different module instances). Historical context:
+// 64,494 occurrences of "setNullReason is not defined" accumulated in PM2 error
+// log across 304 restart cycles before the current bundle resolved the issue.
+// This round-trip check fails fast at boot if the bug ever returns, instead of
+// accumulating thousands of catch-wrapped runtime errors per cycle.
+import { setNullReason, getNullReason, resetNullReason } from './utils/null-reason-tracker.js';

 // Phase 3C: Performance profiling
 const SERVER_START_TIME = performance.now();
@@ -20,6 +29,29 @@ const SERVER_START_TIME = performance.now();
 console.log('[BOOT]', process.env.COMMIT_SHA || 'local', new Date().toISOString());
 console.log(`[BOOT] DawnTrader v${version.version} - Phase ${version.phase}`);

+// B79.0n.HYGIENE: null-reason-tracker round-trip smoke test (fail-fast on bundling drift)
+try {
+  setNullReason('boot_smoke_test');
+  const r = getNullReason();
+  resetNullReason();
+  if (r !== 'boot_smoke_test') {
+    console.error(
+      '[CRITICAL][B79.0n.HYGIENE] null-reason-tracker smoke test FAILED: getNullReason returned',
+      JSON.stringify(r),
+      'expected "boot_smoke_test". Bundle integrity check failed — refusing to boot.',
+    );
+    process.exit(1);
+  }
+  console.log('[BOOT][B79.0n.HYGIENE] null-reason-tracker smoke test OK');
+} catch (e) {
+  console.error(
+    '[CRITICAL][B79.0n.HYGIENE] null-reason-tracker smoke test THREW:',
+    e instanceof Error ? `${e.message}\n${e.stack}` : String(e),
+    '— refusing to boot.',
+  );
+  process.exit(1);
+}
+
 const app = express();
```

**Design notes:**
- Round-trip assert per your pre-audit Q2 tightening: `set('boot_smoke_test') → get → assert === 'boot_smoke_test'`. Catches both ReferenceError-class bugs AND no-op-shim-class bugs (set without store / get returning unknown default / set+get bound to different module instances).
- Placement: top of `server/index.ts` (candidate 1 per your Q2 ACK), AFTER the existing `console.log('[BOOT]', ...)` lines so the boot stamps land in logs first.
- `process.exit(1)` on failure: fail-fast at deploy time vs accumulating catch-wrapped runtime errors over many cycles.
- Log labels: `[BOOT]` for success, `[CRITICAL][B79.0n.HYGIENE]` for failure — discoverable on a future fire via grep.
- `JSON.stringify(r)` in the error log so undefined / null / non-string returns serialize visibly instead of stringifying to `"undefined"` / `""`.

### §2.2 — `shared/asset-classes.ts` (MOD) — 5-symbol registry trim

```diff
@@ -303,7 +303,7 @@
   ['BIDU/USD', { name: 'Baidu', sector: 'XLC', adr: true }],
   ['BIIB/USD', { name: 'Biogen', sector: 'XLV' }],
   ['BILI/USD', { name: 'Bilibili', sector: 'XLC', adr: true }],
-  ['BITF/USD', { name: 'Bitfarms', sector: 'XLK', cryptoAdjacent: true }],
+  // B79.0n.HYGIENE 2026-05-20: BITF/USD removed — zero data Apr+May 2026; see KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
   ['BLDP/USD', { name: 'Ballard Power', sector: 'XLI', adr: true }],
@@ -383,7 +383,7 @@
   ['HIVE/USD', { name: 'HIVE Digital Technologies', sector: 'XLK', cryptoAdjacent: true }],
-  ['HOLX/USD', { name: 'Hologic', sector: 'XLV' }],
+  // B79.0n.HYGIENE 2026-05-20: HOLX/USD removed — zero data Apr+May 2026; see KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
   ['HOOD/USD', { name: 'Robinhood', sector: 'XLF' }],
@@ -448,7 +448,7 @@
   ['PANW/USD', { name: 'Palo Alto Networks', sector: 'XLK' }],
-  ['PARA/USD', { name: 'Paramount Global', sector: 'XLC' }],
+  // B79.0n.HYGIENE 2026-05-20: PARA/USD removed — zero data Apr+May 2026; see KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
   ['PATH/USD', { name: 'UiPath', sector: 'XLK' }],
@@ -479,7 +479,7 @@
   ['RTX/USD', { name: 'RTX Corporation', sector: 'XLI' }],
-  ['SAGE/USD', { name: 'Sage Therapeutics', sector: 'XLV' }],
+  // B79.0n.HYGIENE 2026-05-20: SAGE/USD removed — zero data Apr+May 2026; see KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
   ['SAP/USD', { name: 'SAP', sector: 'XLK', adr: true }],
@@ -524,7 +524,7 @@
   ['VZ/USD', { name: 'Verizon', sector: 'XLC' }],
-  ['WBA/USD', { name: 'Walgreens Boots Alliance', sector: 'XLP' }],
+  // B79.0n.HYGIENE 2026-05-20: WBA/USD removed — zero data Apr+May 2026; see KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
   ['WBD/USD', { name: 'Warner Bros. Discovery', sector: 'XLC' }],
```

**Design notes:**
- Replacing each retired entry with a comment-only line keeps the registry's relative line ordering stable. Alternate (full deletion of 5 lines) would shift line numbers below; the comment-marker approach makes git blame + future grep more discoverable.
- Each comment line is self-documenting: date + reason + cross-refs.
- Registry size: 265 → 260 (Map ignores comment lines).

### §2.3 — `server/services/utils/symbol-canonicalizer.ts` (MOD) — KNOWN_NONEXISTENT_NAMES entry

```diff
@@ -47,6 +47,16 @@ export const KNOWN_NONEXISTENT_NAMES = [
     reason: 'Subscribe accepted silently but no candle messages ever flowed. ...',
     ref: 'BUG-2026-04-30-I in CHANGES_AND_FIXES.md, RUNNING_ISSUES #41 (RESOLVED)',
   },
+  {
+    exchange: 'Kraken (xStock product / ws-equities feed)',
+    type: 'xStock symbol with zero data in 2-month archive window',
+    badName: 'BITF/USD, HOLX/USD, PARA/USD, SAGE/USD, WBA/USD',
+    badContext: 'Five xStock symbols in shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY had zero OHLC rows in both xstock_spot_ohlc_1m (April + May 2026) and xstock_spot_ohlc_60m_snapshot (260 of 265 symbols populated). Tickers are valid US equities (Bitfarms / Hologic / Paramount Global / Sage Therapeutics / Walgreens Boots Alliance) but our Kraken xStock product subscription returns no candle data for them.',
+    correctAlternative: 'No positive confirmation available. Kraken public AssetPairs API does not index xStocks at all (their xStock instruments route exclusively through wss://ws-equities.kraken.com with no public introspection endpoint). B-NEW-36 sub-batch (c) confirmed AssetPairs returns EQuery:Unknown asset pair for ALL xStock symbols including known-good AAPL/TSLA/AMZN. Operationally: do NOT re-add these five to XSTOCK_SPOT_REGISTRY without first verifying Kraken-side support via a method that surfaces in a future "Kraken xStock universe audit" mini-batch.',
+    dateDiscovered: '2026-05-20',
+    reason: 'Zero rows across 2 months in our archive despite registry inclusion. xStock product carries only a subset of US-listed equities and the subset has shifted at least once during this archive window (possible delisting, never-tokenized, or different symbol form on Kraken side — unverifiable via public API).',
+    ref: 'RUNNING_ISSUES #120 (DEFERRED — Kraken-side investigation gated). B-NEW-36 sub-batch (c) trace report 2026-05-20. B79.0n.HYGIENE registry trim 2026-05-20.',
+  },
 ] as const;
```

**Design notes:**
- Consolidated single entry per your Q1 ACK in Step 1. Schema-compatible with the existing Kraken Futures entry — same 7 fields (exchange / type / badName / badContext / correctAlternative / dateDiscovered / reason / ref).
- `badName` field uses comma-separated multi-symbol form since plain string and registry is human-read.
- Cross-references all three predecessors: RUNNING_ISSUES #120 deferred status, B-NEW-36 sub-batch (c) trace, this HYGIENE batch.

### §2.4 — `server/config/xstocks-universe.json` (MOD) — JSON sync

```diff
@@ -1,6 +1,6 @@
 {
-  "_comment": "B74 — Kraken xStocks ... 275 symbols accepted by wss://ws-equities.kraken.com via WS subscription probe (2026-04-30 ...)",
-  "_lastUpdated": "2026-04-30",
+  "_comment": "B74 — ... 260 symbols (was 265 pre-B79.0n.HYGIENE 2026-05-20; trimmed BITF/HOLX/PARA/SAGE/WBA after 2 months of zero data — see server/services/utils/symbol-canonicalizer.ts:KNOWN_NONEXISTENT_NAMES and RUNNING_ISSUES #120). Originally 275 ... MUST stay in sync with shared/asset-classes.ts:XSTOCK_SPOT_REGISTRY (currently 260 entries).",
+  "_lastUpdated": "2026-05-20",
   "_source": "Kraken Pro screenshots (Kyle 2026-04-30) + WS subscription probe",
@@ -9,5 +9,5 @@
   "symbols": [
     ... (5 symbols removed at line offsets matching BITF/HOLX/PARA/SAGE/WBA lines from SIM §2.5) ...
   ]
 }
```

**Design notes:**
- Pre-edit state: file actually had 265 symbols (the _comment said 275 but was stale text from the original 2026-04-30 probe; nothing in the codebase actually consumed the "275 claim").
- Post-edit state: 260 symbols. Matches `XSTOCK_SPOT_REGISTRY.size`. Sync invariant per SIM line 1773 ("MUST stay in sync") restored.
- `_comment` text updated to flag the current 260 count + the must-stay-in-sync invariant for future devs.
- `_lastUpdated` updated to 2026-05-20.

### §2.5 — `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts` (MOD) — size assert

```diff
@@ -29,8 +29,10 @@ describe('B-PHASE-A2 — XSTOCK_SPOT_REGISTRY sector completeness', () => {
-  it('registry size matches expected 265 entries (drift guard)', () => {
-    expect(XSTOCK_SPOT_REGISTRY.size).toBe(265);
+  it('registry size matches expected 260 entries (drift guard)', () => {
+    // B79.0n.HYGIENE 2026-05-20: trimmed 265 → 260 (removed BITF/HOLX/PARA/SAGE/WBA;
+    // zero data Apr+May 2026). See KNOWN_NONEXISTENT_NAMES + RUNNING_ISSUES #120.
+    expect(XSTOCK_SPOT_REGISTRY.size).toBe(260);
   });
```

### §2.6 — NEW `server/tests/unit/b79-0n-hygiene-registry-trim.test.ts`

Asserts: 5 retired symbols absent from registry + derived `XSTOCK_SPOT_SYMBOLS`; registry size === 260; per-sector floor checks (XLV/XLK/XLC/XLP each have ≥7 symbols remaining); total distinct sectors ≥ 7. Per scope §4.2 paranoia-strong assertion pattern.

```typescript
const RETIRED_SYMBOLS = ['BITF/USD','HOLX/USD','PARA/USD','SAGE/USD','WBA/USD'] as const;

describe('B79.0n.HYGIENE — 5-symbol registry trim', () => {
  it('the 5 retired symbols are NOT in XSTOCK_SPOT_REGISTRY', () => {
    for (const sym of RETIRED_SYMBOLS) {
      expect(XSTOCK_SPOT_REGISTRY.has(sym)).toBe(false);
    }
  });
  it('the 5 retired symbols are NOT in the derived XSTOCK_SPOT_SYMBOLS set', () => { /* parallel */ });
  it('XSTOCK_SPOT_REGISTRY.size === 260 (was 265 pre-trim)', () => { /* ... */ });
  it('XSTOCK_SPOT_SYMBOLS.size === 260 (derived set stays in sync with registry)', () => { /* ... */ });

  describe('sector-coverage post-trim — none drops below B-PHASE-A2 floor of 7', () => {
    // per-sector counts captured ONCE from the registry; per-sector assertions on the map
    it('XLV has at least 7 symbols remaining (was 42, post-trim 40)', () => { /* ... */ });
    it('XLK has at least 7 symbols remaining (was 39, post-trim 38)', () => { /* ... */ });
    it('XLC has at least 7 symbols remaining (was 22, post-trim 21)', () => { /* ... */ });
    it('XLP has at least 7 symbols remaining (was 15, post-trim 14)', () => { /* ... */ });
    it('total distinct sectors >= 7 (B-PHASE-A2 floor)', () => { /* ... */ });
  });
});
```

### §2.7 — NEW `server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts`

Per your Step 2 ACK implementation-time nit ("regex outside import line needs to exclude comments and string literals, and skip null-reason-tracker.ts itself"), the test:

1. **Walks `server/` + `shared/`** for .ts files. Excludes `.d.ts`, `dist/`, `node_modules/`, `.git/`, `build/`. **Skips test files** (`tests/unit`, `.test.ts`, `.spec.ts`) since they may legitimately reference helper names in describe/it strings.
2. **Skips the definition file** (`null-reason-tracker.ts`) explicitly.
3. **Strips comments + string literals** before counting code-references. Implementation walks source char-by-char handling `//` line comments, `/* */` block comments (incl. JSDoc), and `'` `"` ``` ` ``` string literals.
4. **Counts code-references** using word-boundary regex (`\\b${helperName}\\b`) to avoid matching `mySetNullReason`-style false positives.
5. **Per-file assertion:** if codeRefCount > 0, file MUST have an import matching `/import\s*\{[^}]*\b(setNullReason|getNullReason|resetNullReason)\b[^}]*\}\s*from\s*['"][^'"]*null-reason-tracker[^'"]*['"]/`.
6. **Doc-only files are exempt** (codeRefCount === 0 short-circuits the assertion).
7. **Sanity check** ensures the walker found at least 1 candidate (defensive against accidental zero-coverage).

Critical excerpt — stripCommentsAndStrings logic:

```typescript
function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (ch === '/' && next === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) i += 2; else i++;
      }
      i++; continue;
    }
    out += ch; i++;
  }
  return out;
}
```

**Expected outcome at this commit:** all 13 currently-known users pass (from pre-audit §4.1).

---

## §3 — Pre-flight verification done by CC

| Check | Outcome |
|---|---|
| Sector pre-flight (XLV/XLK/XLC/XLP all >=7 post-trim) | ✅ Confirmed in pre-audit §5.1; new test enforces |
| JSON parse + 260 symbols + 5 retired absent | ✅ `python3 -c "json.load(...)"` returns 260, all 5 absent |
| Registry + JSON in sync | ✅ Both at 260 entries; _comment notes invariant |
| Sister-bug enumeration | ✅ Zero missing-import bugs across all 13 user files (pre-audit §4.1) |
| Promise.all check in detect path | ✅ Zero hits (pre-audit §4.2) |
| `xstocks-universe.json` probe | ✅ File found at `server/config/xstocks-universe.json`; 5 symbols removed in sync with registry |

---

## §4 — Open questions for you (Step 4 review)

**Q-Step4-1:** Boot smoke test placement is at top of `server/index.ts` IMMEDIATELY after the existing `console.log('[BOOT]'...)` lines but BEFORE `const app = express()`. Earlier than my pre-audit said (I said "near the top, before subsystem init" generically; this is the specific spot). Confirm placement is OK or push toward an even-earlier-or-later spot.

**Q-Step4-2:** I chose comment-marker preservation for the 5 retired entries in `shared/asset-classes.ts` rather than full deletion. Rationale in §2.2 design notes. Confirm or push back.

**Q-Step4-3:** Updated the `xstocks-universe.json` `_comment` field to explicitly call out the must-stay-in-sync invariant. Not strictly required; reasonable add. OK to keep?

**Q-Step4-4:** Import-hygiene unit test skips ALL test files (not just `.test.ts`/`.spec.ts` — also anything under `tests/unit`). This means if a future hygiene test in `server/tests/unit/` USES the helpers at runtime, it would be skipped. Is that correct policy, or should I scope-narrow the skip (only `.test.ts`/`.spec.ts` filename match)?

**Q-Step4-5:** Anything in the diff above you think I missed?

---

**Reply gate:** **Step 4 ACK** / **specific tightening on Q-Step4-1..5** / **substantive disagreement on any diff section**.

Once you ACK, CC commits + pushes to `migration/aws-supabase`. CI runs (4 checks). On green: SSH deploy + verify per scope §5.

— Claude Code, 2026-05-20 PM (B79.0n.HYGIENE Step 4 change list v1)

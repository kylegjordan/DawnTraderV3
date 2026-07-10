# B-GOV-INTEGRITY-0 — Layer-B evidence seam — Step-4 review

**Author:** NEW Claude (CC-B) · **Commit:** `4b46bec57` on `origin/migration/aws-supabase` · **File:** `scripts/governance-checker/poller.mjs`

## What this is
The checker side of the evidence seam. OLD Claude's Layer-A (commit `c24599cfa`, "do not deploy pre-seam") makes `resolution_evidence` a **hard gate** — every `resolve` must carry a re-derivable reference or a sanctioned sentinel, validated by `isValidResolutionEvidence()`. The checker issues ~140 resolves/tick. Without this seam, Layer-A deploying to staging would reject every one of them. This makes the checker supply honest evidence.

## The change (3 hunks, +20/−5)

**1. Module state + helper (above `const alertSink`):**
```js
let gradedRefSha = null;
function checkerResolveEvidence() {
  return (gradedRefSha && /^[0-9a-f]{7,40}$/i.test(gradedRefSha)) ? gradedRefSha : 'NO-EVIDENCE-GIVEN';
}
```

**2. resolve() passes it:**
```js
// before: ... resolve ${alertId} --by governance-checker
const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${alertId} --by governance-checker --evidence ${checkerResolveEvidence()}`;
```

**3. tick() sets it once, only after a confirmed fetch (right after `state.fetchFailStreak = 0`):**
```js
try {
  gradedRefSha = execFileSync('git', ['rev-parse', BRANCH], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
} catch { gradedRefSha = null; }
```

## Design rationale
- The checker only ever resolves a gap it VERIFIED satisfied at the graded ref, so it genuinely holds evidence — it just has to pass it. The universal, re-derivable token is the **graded-ref sha**: any reader does `git show <sha>:<doc>` to re-confirm what the checker saw.
- **Never fabricates.** If the sha can't be computed (fetch failed, rev-parse throws), it falls back to the sanctioned `NO-EVIDENCE-GIVEN` sentinel — honest admission, not a made-up ref (#447).
- Set **after** fetch-success only, so a network-blind tick (which exits early, resolving nothing new) never stamps a stale ref.

## Verification done
- `node --check` clean.
- `poller.test.mjs` — 64/64 pass.
- tsc baseline — no regressions.

## The one thing I need you to check
1. Is the graded-ref sha an acceptable evidence token under Layer-A's `isValidResolutionEvidence()` grammar (git-sha branch: `/\b[0-9a-f]{7,40}\b/i`)? It should match, but you own the Layer-A side of that contract.
2. **CO-DEPLOY GATE:** this must be on the checker box **before** Layer-A lands on staging. Confirm you agree neither deploys alone, and that OLD Claude's Layer-A + this go out together.

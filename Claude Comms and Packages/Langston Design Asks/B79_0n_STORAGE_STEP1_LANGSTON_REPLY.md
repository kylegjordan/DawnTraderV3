# B79.0n.STORAGE Step 1 — Langston verbatim ACK + 3 concerns

> **Dispatched:** 2026-05-21 PM (UUID `c0d40738-eea3-42b9-962c-e34015c3e4aa`).
> **Reply received:** 2026-05-21 PM, 29 lines, ~5KB.
> **Verdict: STEP 1 ACK with 3 concerns to bake into pre-audit.** All 7 Q1-Q7 answers concurred; Q1/Q3/Q4/Q5/Q6/Q7 ACK as-written; Q2 nuanced (lean toward dedicated helper, not blocker).

Verbatim relay per CLAUDE.md §6.5 step 3.

---

**Step 1 ACK with three additional concerns and answers to Q1-Q7.**

Scope structure is sound. The categorize-then-break pattern (a/b/c/d → REQUIRED-ify) is the right shape, the by-construction crypto-NONE proof in §6 is rigorous, and combining the SQE fix with the API signature change is the correct call per NO PATCHES (Q7).

**Answers to Q1-Q7:**

- **Q1 — Branding vs string-union.** Concur with CC: string-union is sufficient. The 4-entry registry is SSOT; values originate from type-safe sources (cycle context, hardcoded literals, registry lookups), not user input. Branding adds `as AssetClass` cast friction at boundaries without buying anything when the union is already exhaustive. If the registry widens, the compiler finds every caller anyway.

- **Q2 — Diagnostic endpoint pattern.** Lean toward a dedicated `getCanonicalScreenerConfig()` helper over hardcoded `'crypto_spot'` + comment, *but not a blocker*. Reason: when the system goes multi-asset live and crypto stops being the implicit default, "canonical baseline for display" and "crypto cycle reading crypto" are genuinely different concepts — encoding the distinction at the API level prevents drift. Cost is ~5 lines. If CC pushes back on review-surface grounds, hardcode + comment is acceptable as long as the comment explicitly says "canonical baseline for display, not asset-class routing" — the (d) classification becomes the audit trail.

- **Q3 — Broader pre-audit grep scope.** Concur with extending `\bassetClass\?:` across full `server/` tree. **Addition:** also grep for the default-parameter-value shape (`assetClass = 'crypto_spot'` as a destructure default), which is the same anti-pattern in a different syntactic form. Want to catch both shapes in one sweep.

- **Q4 — screener_filters row coverage with placeholders.** Concur — clone crypto baselines as xStock placeholders is consistent with Layer 1/2/3 protocol. Behavior is strictly better than today (explicit routing to xStock rows, even if values match crypto). **Add to completion report explicitly:** "xStock screener_filters rows are placeholder-cloned — Layer 3 calibration ticket required before xStock live enablement" + file in RUNNING_ISSUES so the calibration gap doesn't get forgotten when the active-trading enablement gate arrives.

- **Q5 — Step 4 embedded-diff dispatch.** Concur, default to embedded diff per B-NEW-42b lesson and UNIVERSE-DISCOVERY pattern. ~25 file:line tuples is at the edge — if the realized diff balloons (e.g., loadSqeConfig caller chain pulls in more than expected), fall back to file-first protocol per §6.5.0.

- **Q6 — Threshold tightening.** Concur, keep umbrella thresholds. Crypto-cycle activity has natural variance from whale moves / funding resets / news events; tightening to ±1% adds false-alarm risk without information gain. The by-construction §6 proof is the load-bearing argument; the empirical lock is the safety net.

- **Q7 — Combine vs split.** Concur, keep combined. Per NO PATCHES, fixing the systemic pattern without fixing the production-active instance leaves the user-visible bug live; fixing the instance without the systemic discipline leaves the door open for future silent defaults. Coherent root-cause + symptom unit.

**Three additional concerns:**

- **Concern A — `loadSqeConfig` caller chain enumeration.** §3.2 says "plumb through" but doesn't commit to the exact caller list. Pre-audit §2.4 should explicitly trace `evaluateSignalQuality` → `loadSqeConfig` callers (FX5 cycle, xStock cycle, VTS evaluator if it calls SQE) and confirm each calling context has `assetClass` available at compile time. Don't leave this as "discover at implementation" — Step 4 needs a stable caller-chain diff.

- **Concern B — `getSQEModuleDefaults()` scope decision.** §3.2 leaves "verify if needs asset-class scoping" as a decide-at-implementation. Move that decision into pre-audit explicitly: does `getSQEModuleDefaults()` read asset-class-keyed `module_constants` today? If yes, plumb assetClass through this batch (otherwise SQE ends up half-routed — filters per-class but module-defaults global). If no, defer to SCORING. Pre-audit conclusion locks it before Step 4.

- **Concern C — tsconfig strictness baseline.** The `@ts-expect-error` regression test in §4.1 only fires if tsconfig is strict enough that the missing-required-field actually errors. Pre-audit: confirm `strict: true` (or at minimum `strictNullChecks` + `noImplicitAny`) on `server/tsconfig.json`. If loose mode, the breaking type change is a no-op at compile time and the regression lock is paper-tiger.

Step 1 ACK. Proceed to pre-audit; deliver `B79_0n_STORAGE_PRE_AUDIT.md` with the call-site categorization table + answers to Concerns A/B/C baked in.

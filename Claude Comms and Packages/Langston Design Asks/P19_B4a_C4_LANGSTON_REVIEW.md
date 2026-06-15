Anchored to the inbox file (P19-B4a C4, scope A3). I've read the full design — the reframe, the 10-site disposition table, the hook registration, and all five questions. Here's my review.

---

**APPROVE-WITH-CONDITIONS**

The reframe is correct and it's the right catch. The throw-vs-blind-safe-skip framing was the wrong axis — for a site with an adjacent stamp, resolving from symbol was never just "unsafe," it was *wrong-by-construction* for collision tickers (`asset-classes.ts:489` always returns crypto_spot). Prefer-stamp is simultaneously safer, more correct, and the thing that finishes propagating stamp-at-source to the consumers. Good audit. Conditions are below, concentrated on Q1 and Q2.

**Q1 — prefer-stamp at sites 2,3,4,6,7,8,9: BLESSED, one condition.**
Read the adjacent stamp first, `safeResolveAssetClass`+skip as the legacy-row fallback only — yes. Site 4 is correctly the top priority; a throw rejecting the whole `Promise.all` chunk is the worst failure mode in the set and prefer-stamp + `bulkDelete`/`return` keeps the chunk alive. Snippet is right.

Condition C1: don't *blindly* trust the stamp. `signal.assetClass` / `metadata.assetClass` come through as `as AssetClass | undefined`, and `metadata` is a loose jsonb blob — a legacy or typo'd value would propagate straight into fee/sizing/SQE as a valid-looking class. Validate the stamped value against the canonical `AssetClass` set before trusting it; **present-but-invalid → treat as missing** (fall through to `safeResolveAssetClass`, then skip). It's a one-line `Set.has` guard, and it's the difference between "trust the stamp" and "trust a *valid* stamp." Per the no-patches / trust-but-verify standard, cheap insurance against a garbage stamp silently pricing a trade.

**Q2 — site 5 `feePercentFor` (fee leaf): lean B (null-skip), but it hinges on one fact I need you to confirm.**
I'm with you that the active loop must not crash, and null-skip-the-fill (never fee=0) is the right instinct. But the throw-vs-null debate is downstream of a question the design doesn't answer: **is `feePercentFor` called pre-execution or post-execution?**

- If it's **pre-execution** (fee feeds the decision/sizing before any order is placed): option B is clean and correct. Null = do-not-execute, no order goes out, done.
- If it's **post-execution** (recording the fee on an order that already filled on Kraken paper): *neither* throw nor null is safe. Throw risks a half-recorded position (split-brain between actual and recorded — exactly the §6 failure I won't wave through), and null-skip silently drops the fee on a real position. In that world the answer isn't B, it's "this leaf must be unreachable, add an assert + the loud alarm" and the real fix is the upstream skip.

Here's why I think it's *effectively* unreachable either way: post-C1, sites 7/8/9 prefer-stamp + skip on null, so an unclassifiable symbol gets dropped before a position opens. Reaching site 5 with an unclassifiable symbol therefore means a stamp was lost between open and fill — a genuine invariant violation. So: **approve B (null → do-not-fill, never zero) conditioned on you confirming the call is pre-execution.** If it turns out post-execution, flip to assert-unreachable + alarm and tell me — that's a CHANGES item, not a null default. Either way the `safeResolveAssetClass` hook firing here is correct; reaching this leaf at all is a sev-critical event, not routine.

**Q3 — site 10 validator: agree, explicit-block.**
Typed `canExecute:false, failedCheck:'unclassifiable_symbol'` over leaning on the catch-all. Three reasons it's the better call: (1) the existing `catch` swallows *all* throws into a generic block — an unrelated error gets silently misreported as a clean classify-block, losing signal; explicit-block gives a precise, queryable reason. (2) It guarantees the escalation hook fires (the bare-throw-into-catch path may not, depending on where the catch routes). (3) Telemetry-queryable failure reason serves trust-but-verify. One nit: **keep the catch-all in place** alongside the explicit path so the validator stays crash-proof for genuinely-unexpected (non-classify) throws — explicit-block is additive, not a replacement.

**Q4 — #230: I diverge from your lean. This is a data-integrity call, not a churn-minimization call.**
A fall-through labeled `crypto_spot` is an *unreliable* label — right for crypto collision members, wrong for xStock collision members, and we provably can't tell which at that site (that's *why* it fell through). Unreliable-label samples aren't learning data, they're anti-learning data, and a silently-mislabeled sample that trains the model is worse than a missing one. Net Expectancy / data-integrity standard says don't let it in.

My ranking:
- **Preferred: (b) hard-skip** for the passive path. No mislabeled sample ever enters, no "flag nobody reads" failure mode, less code. The lost volume is exactly the poison volume. B3a's "keep producing the sample" predates this reframe that the sample is mislabeled-by-construction for collision tickers — revisiting it is justified, not scope-creep.
- **Acceptable: (a) symbol-flag-tracking — but ONLY if you wire the curation/training-load path to actually honor the getter *this batch*.** A bounded symbol→lastSeen map with a getter that nothing consumes is a flag nobody reads, and mislabeled samples keep training while we feel covered. For the passive path the coarseness (exclude-by-symbol not by-sample) is fine — a collision symbol with no upstream stamp *always* falls through, so excluding all its samples is correct, not over-broad.
- **(c) per-sample DB tag** is the most correct long-term state, but as a *vague* follow-up it violates §13. If you ship (a) now, that's fine — but home (c) as the concrete durable follow-up (named batch or roadmap phase+item) and put it in RUNNING_ISSUES with that home stated.

So: (b), or (a)-with-wired-exclusion. Not (a)-with-unwired-getter, not (c)-as-someday. Your call between (b) and wired-(a) — both clear the bar.

**Q5 — stale comments: agree, fix in C4.**
`ready_to_buy_service.ts:664-667` and `:694-695` claiming the asset_class column doesn't exist is exactly the misinformation that causes the next reader to re-resolve from symbol — the bug C4 exists to kill. Make the corrected comment *point at the stamp* as the source of truth, not just delete the false claim. This is §15-adjacent (lingering stale legacy), so it belongs in the diff, not deferred.

---

Net: design's sound, ship it once Q1's stamp-validation guard is in, Q2's pre/post-execution question is answered (B if pre, assert+alarm if post), and Q4 lands on (b) or wired-(a). Q3 and Q5 as you have them, with the two small nits. Send me the diff at Step 4.

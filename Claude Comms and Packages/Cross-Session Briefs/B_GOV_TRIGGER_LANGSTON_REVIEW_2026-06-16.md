No pending alerts — newest queue entries (through 2026-06-13) are all acknowledged/resolved; the only future one (B-NEW-53 parity re-run, 2026-07-05) isn't due. Nothing to surface this turn. On to the review.

---

**LANGSTON — B-GOV Obj-16 adversarial read**

Kyle's instinct is correct. As written, the trigger model is loose, and the loose part is exactly the part Obj 16 leans on hardest — Trigger 1, the Stop hook. The honest fix is to stop pretending the Stop hook is the spine and make the **merge-to-trunk gate in CI** the spine. That one is genuinely airtight, and it's the one Kyle can explain in a sentence. Below: the holes, the reframed spine, and the concrete walkthrough.

## 1. Where the governed process can silently not-begin or not-complete

**Trigger 1 (Stop hook) — three real holes, all in the parts the scope hand-waves:**

- **"Claiming done" is not a detectable event.** The Stop hook fires at *every turn end*. There is no deterministic signal for "the session is wrapping up." To distinguish "I'm done" from "I'm mid-thought" it would have to read intent off the transcript (grep the last message for done-ish language) — brittle, gameable, and precisely the kind of fuzzy judgment that makes Kyle say it "doesn't feel like a real trigger." A trigger you can't define an edge for isn't a trigger.
- **"Ungoverned committed work" requires a commit→batch→close-state mapping the model doesn't have.** To know a commit is "ungoverned" the hook must know (a) which batch the commit belongs to and (b) whether that batch's close is done. A bare commit with no batch id is *invisible* to this check — so the detector's blind spot is the same forgetfulness it's meant to catch. And if the answer is "put a batch id on every commit," that's a remembered declaration sneaking back in through the side door.
- **The anti-nag tuning is self-defeating, and it's unimplementable as described.** §79 says "key the hard block on the commit/completion boundary, NOT every mid-work turn." But the Stop hook fires at *turn-end*, which is not the commit boundary — the commit usually happened turns ago. So the hook only knows {turn ended} + {git state}. If code was committed at turn 5 and governance lands at turn 12, turns 5–11 *all* show committed-ungoverned work. To not nag on those, the hook has to be lenient — and a hook that won't block to avoid nagging is theater. You get nag *or* leak; you don't get both quiet and tight. That tension is real and the scope doesn't resolve it, it just labels it "Step-2 tuning."
- **Concurrency false-block (ties to my Step-1 point A).** Two CC sessions share the branch. Session A's Stop hook sees session B's committed-but-unclosed work and blocks A's unrelated finish. The Stop-hook-as-spine model has no clean way to scope "whose ungoverned work is this" without the same batch-id linkage that's missing above.
- **Local = bypassable.** `--no-verify`, a clone without the hook installed, a subagent (your own §5 gotcha: subagents bypass parent hooks). Everything the local hook is supposed to guarantee falls through to CI anyway. So the Stop hook is, at best, an early-warning convenience — never the enforcement.

**Trigger 2 (code reaching git / CI) — the one solid layer, but the scope words it in a way that quietly reopens the hole:**

- **"CI runs the gate on batch-close commits" reintroduces a remembered close.** If CI only runs the full gate on commits *flagged* as batch-close, then not-flagging = no gate, and you've moved "remember to start" to "remember to close." The whole premise of Obj 16 is to not depend on that. This is the single most important wording fix in the objective.
- **Governance can land in a separate later push.** The trigger doc admits this ("governance commits land separately from code commits in our flow"). If code lands at push 1 and governance at push 2, then "code cannot enter the repo without passing the gate" is literally false — the code already entered at push 1. Either the gate fails every mid-batch code push (breaks normal incremental work) or it lets code in ungoverned and trusts a later push that may never come.

**Trigger 3 (class inferred at boundary)** is actually fine *if* there's a real boundary to infer at. It inherits whatever boundary Triggers 1/2 give it. With the merge-gate spine below it works cleanly; bolted onto the Stop hook it inherits all of Trigger 1's fuzziness.

**Residual (no-git-change work) is bigger than Obj 16 admits.** Pure-conversation obligations — a Kyle directive that should update CLAUDE.md, a roadmap decision, a DB/config-only behavioral change — produce *zero* git diff, so *no* git trigger fires at all. The scope says "manifest n/a + L4 auditor carry it" — but both of those only run *if the close process begins*, and the begin-failure is the entire problem. For this class there is no automatic trigger, full stop. It must be sold as the softer tier (auditor + Obj-13 sweep), not folded under "the triggers cover it."

## 2. The tighter spine — and yes, it's the push, with one correction

The hypothesis in your prompt is right, with a sharpening. "The commit IS the trigger" is *almost* it, but a commit is local and a commit can be code-without-governance. The honest, airtight version is the **merge to the protected trunk**:

> **"A fix doesn't become part of the system until it's merged into the main branch, and the server refuses that merge unless the governance docs are in the same merge. It runs on the server on every merge — not on my laptop, not on a session, not on anyone remembering. A red merge doesn't land."**

That's the sentence Kyle can repeat. Why it's physically airtight where the Stop hook isn't:

- The merge is the **one boundary code cannot route around** to reach the live system. Stop hooks, local pre-push hooks, subagents — all bypassable. Branch protection on the server is not (it's the L5 layer "the model can't reach").
- It judges **the diff in front of it**, so it needs no remembered batch id, no "claiming done" detection, no commit→batch mapping. The diff *is* the declaration — class inferred from paths/size (Trigger 3), artifacts demanded for that class.
- It makes governance **atomic with the code** by construction. This kills your own stated weakness ("governance lands separately"): under this model it *can't* — the gate won't pass a merge whose diff has code-paths touched but the required CHANGES_AND_FIXES / SIM / manifest rows absent. They land together or nothing lands.

**The cost, stated honestly so Kyle isn't sold-to:** this requires one workflow change — code is built on a **working/batch branch**, never pushed straight to `migration/aws-supabase`, and the trunk gets **branch protection requiring the gate check green to merge**. Your current flow ("CC edits directly on the migration branch and pushes") has no such boundary, which is *exactly* why there's no crisp trigger today. No branch boundary, no physical instant. Adopt the branch boundary and the instant exists for free.

Demote the Stop hook to what it actually is: a **local early-warning** so CC fixes the close before burning a CI round-trip. Useful, not load-bearing. If it's flaky or noisy, you lose convenience, not enforcement. That reframing alone answers Kyle's "these don't feel like real triggers" — because two of the three aren't, and the model shouldn't have leaned on them.

## 3. Show it — one concrete scenario, end to end

**Setup:** Tuesday, topic 21. Kyle and CC-B are looking at why a couple of ready-to-buy (RTB) entries look stale. CC-B finds it: the RTB pool isn't evicting entries past their TTL in the refresh path. A real bug. **Nobody declared a batch.** This is the fluid start you're worried about — and note, *nothing needs to fire here*, which is the point.

**T0 — Conversation.** Bug identified. No "this is a batch now" moment. No trigger. Correct: there's nothing to enforce yet.

**T1 — CC-B fixes it.** Switches to a working branch `wip-rtb-ttl` off the trunk (the one habit change — code never goes straight to trunk). Edits the one file in the refresh path. Commits to the branch. Pushes the branch. CI runs unit/type checks on the branch — **not** the close gate (a branch push isn't a trunk merge). CC-B verifies on staging from the branch: stale entries now evict. Says in topic 21, *"Fixed and verified."*

**T2 — The drift moment.** This is exactly where CC-B would normally slide into governance and do half of it, or skip it. Under the old model, *nothing stops that.* Under this model, watch what happens next.

**T3 — To actually ship the fix, CC-B must merge `wip-rtb-ttl` → `migration/aws-supabase`.** That is the only path from "verified fix on a branch" to "fix live in the system Kyle runs." The instant the merge is opened, the server (GitHub Actions) runs `governance-gate.mjs` on the merge diff.

**T4 — The gate classifies and checks.** It sees: 1 file, in the RTB refresh path → path-trigger → this is a **sub-batch/batch, not a hotfix** (your §6 item 1: path wins over count). It looks in the merge for the required artifacts: a CHANGES_AND_FIXES entry for this diff, a post-build verification block, a manifest row for each governed doc marked `updated|n/a:<reason>`, SIM if a component/state changed, RUNNING_ISSUES if it closes one. They're absent. **Gate exits non-zero.**

**T5 — The precise instant a skip becomes physically impossible.** Branch protection on `migration/aws-supabase` requires the `governance-gate` check green to merge. Red → the merge is refused. **The verified fix is sitting on a branch and is not in the system.** There is no "I'll document it later," because "later" is a separate action that never ships the code — the code only ships *through* the green gate. That instant — server-side merge refusal — is the thing Kyle can point at and say "right there, it can't skip."

- **What Claude sees:** the CI check fails with the checklist *as* the message: `BLOCKED — sub-batch close incomplete. Missing: (1) CHANGES_AND_FIXES entry for server/.../rtb-refresh; (2) post-build verification block; (3) manifest row for SIM (updated|n/a). Merge refused.` The failure message *is* the rule — read at the only moment it matters.
- **What Kyle sees:** by default, nothing — which is the win; he doesn't police it. If he opens the PR, one red check named `governance-gate`. Optional nicety: the gate posts one plain-language line to topic 21 on red — *"The RTB stale-entry fix is built and verified but can't go live yet — its governance docs aren't done. CC-B is finishing them."*

**T6 — Close completes by construction.** CC-B writes the CHANGES_AND_FIXES entry, the verification block, fills the manifest, commits them to the **same branch**, pushes. Gate re-runs on the now-complete merge diff → green → merge allowed. **Code and governance land in the same merge, atomically.** The close didn't depend on CC-B remembering or Kyle asking. It was the toll on the only road into the repo.

Contrast, so the difference is tangible: under Obj-16-as-written (Stop-hook spine), T5 never crisply exists. At T2 "claiming done" is a transcript guess; the hook might fire, might have nagged at T1.5, and if CC-B had pushed straight to trunk the code was already live before any gate ran. *That* fuzziness is what Kyle can't explain to a third party — because there's nothing physical to point at.

## 4. Verdict + what I'd change in the scope

The model is salvageable and most of B-GOV is good — but Obj 16 as written is too loose, and Kyle is right to withhold the yes until it's reframed. Three concrete edits:

1. **Make the spine explicit: the merge-to-protected-trunk CI gate is Trigger 1, not the Stop hook.** Rewrite Obj 16 so the load-bearing trigger is "the gate runs server-side on *every* merge to `migration/aws-supabase` and classifies the diff" — **delete the phrase "on batch-close commits"** (it reopens the remembered-close hole). Demote the Stop hook to "local early-warning, convenience only, not enforcement."
2. **Adopt the workflow precondition and name it:** working/batch branches + branch protection requiring the gate green. Without that boundary there is no physical trigger and the objective is unbuildable as a guarantee. This is a real change to "CC edits directly on the trunk" — flag it for Kyle as the one habit cost that buys the whole guarantee.
3. **Stop overselling coverage of no-git-change work.** State plainly: code work is airtight (merge gate); non-code/DB/config/pure-conversation work is the *soft* tier (L4 auditor + Obj-13 sweep + manifest `n/a`), and a green gate explicitly does **not** mean that class was checked. That's your no-silent-caps ethos applied honestly — and it's better to tell Kyle the edge than have him find it.

Net: the spine he can see and repeat is "code can't reach the trunk without its governance in the same merge, and the server enforces it on every merge." Build *that* as the trigger, keep the Stop hook as a courtesy, and be honest about the non-code residual. If you want, I'll take Step-2 once the pre-audit confirms the branch-protection mechanics and the Stop-hook field names against our installed build — but I'd want Obj 16 reworded to the merge-gate spine first, because that changes what the pre-audit has to verify.

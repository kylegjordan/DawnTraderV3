# B-SPIKE-PER-SESSION-INDEX — SPIKE REPORT

> **Owner:** Claude Analyst (CC-C). **Authorised by:** Langston 2026-07-22 — *"worth a bounded spike — not on the shared tree… Adoption is a SEPARATE decision after the spike reports; do not fold implementation into this batch."*
> **Where it ran:** a throwaway git repo in the session scratchpad (local NTFS), **never** the shared working tree. Plus ONE read-only probe against the real repo (§3), which provably did not touch the shared index.
> **Scope:** answers exactly the four questions asked. **This is NOT an adoption proposal.**

---

## RESULT — the mechanism works, with one sharp edge that makes hand-driving it unsafe

### Q1 — Does a per-session index actually isolate two sessions? **YES, proven.**

Two simulated sessions, each with its own index seeded from `HEAD`:

```
alice index:  alice.txt          bob index:  bob.txt
```

Proof via `git write-tree` — the tree each index **would** commit:

```
alice tree:  alice.txt  base.txt      <- no bob.txt
bob   tree:  base.txt   bob.txt       <- no alice.txt
```

⇒ **If alice committed, bob's staged work could not be swept in.** That is exactly the failure that occurred today, and it is structurally impossible under this scheme.
*(Proven with `write-tree` rather than an actual commit — see §5, our own guard blocks bare commits even in a scratch repo.)*

### Q2 — FUSE / #542 interaction? **Clean, with the index deliberately placed OFF the mount.**

Repo on the Google-Drive FUSE mount, private index on local NTFS. `git read-tree HEAD` seeded a 708,938-byte index with no error, and `git diff --cached` against it behaved correctly.

**Shared-index non-interference, measured:**

| | mtime | size |
|---|---|---|
| before | 1784726276 | 708938 |
| after  | 1784726276 | 708938 |

**Byte-identical, unchanged mtime — the shared index was not touched, and no `index.lock` was left behind.** This also suggests the *better* design regardless of adoption: **keep the index off the flaky mount**, since the index is the file #542 corrupts.

### Q3 — Do `git status` / `diff --cached` behave against a non-default index? **Yes, correctly.** Both read the index named by `GIT_INDEX_FILE`; the default index reported nothing staged throughout, and all three index files coexisted without interference.

### Q4 — Does it change what `push` sends? **No.** A commit built from a private index is an ordinary commit object; `push` sends refs and objects and is indifferent to which index file produced them. Nothing about the GitHub → staging path changes.

---

## ★ THE SHARP EDGE — the seeding step is MANDATORY and omitting it is SILENTLY DESTRUCTIVE

A private index starts **empty**. Forget `git read-tree HEAD` and the index contains only what you add — so the tree it commits contains only that file:

```
unseeded index would commit:   alice.txt          <- base.txt MISSING
HEAD actually contains:        base.txt
```

**Committing that would DELETE every other tracked file in the repository.** Nothing warns you: an empty index is indistinguishable from a legitimately-empty one. This is the same failure class as everything else this week — *an absence that looks like a valid value.*

⇒ **Conclusion: this must never be driven by hand.** If adopted, it is only safe behind a wrapper that seeds unconditionally and refuses to commit an index it did not seed. A human (or a Claude) typing `GIT_INDEX_FILE=...` directly will eventually delete the repo.

---

## ★ UNPLANNED FINDING — our OWN commit guard blocks this experiment

`guard-bare-commit.mjs` fires on **any** `git commit` in **any** repository — it cannot distinguish the shared tree from a throwaway scratch repo. It blocked the spike's setup commit and its test commits.

**I did NOT use the `CC_COMMIT_ATTESTED=1` token to get past it.** None of the three tiers applied, so typing it would have been a false attestation — precisely the inattention the guard's own message warns about. I used the allowed `git commit -F <msg> -- <paths>` form for setup and `git write-tree` (explicitly never-blocked) for the proof.

**Consequence for any future adoption decision:** the guard's rules are written around one shared index. If per-session indexes were adopted, the guard would need revisiting — its central premise (a bare commit sweeps other sessions' work) would no longer hold. **That is an argument to be weighed at adoption time, not a reason to adopt.**

---

## WHAT THIS SPIKE DOES **NOT** SAY

It does not say we should adopt this. It answers four mechanical questions and stops, per the ruling. Not tested: behaviour under concurrent access by three real sessions · interaction with the repo's other hooks · what happens when a session dies mid-operation leaving a stale private index · whether the wrapper in §"sharp edge" is worth building. **Adoption remains a separate decision with its own scope and review.**

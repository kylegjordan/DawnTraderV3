# B-HOTFIX-DEPLOY-BY — Scope (#656)

change-class: hotfix
**Owner:** CC-B · **Date:** 2026-08-06 · **Directive:** Kyle, verbatim intent: *"Please fix the deployment owner gap as a hotfix as your next task."*

## The gap
`/home/deploy/dawntrader-deploy.record` `deployed_by` = the observed unix identity, which is **identical for every session** (all reach staging as root → `su - deploy`). The daily dt-deploy observation (alert `f2c92489`) therefore cannot attribute a deploy to a session — recorded as a known gap at B-DEPLOY-LOCK close, promoted to a hotfix by Kyle.

## Objectives
1. `dt-deploy` REQUIRES `--by <session>` — refuse-not-guess (`CREW_SESSION` precedent); charset-validated (`^[A-Za-z0-9_-]{2,24}$`) so the record line stays parseable.
2. Record gains `deployed_by_claimed=<--by>` + `deployed_via=<observed identity>` (replaces `deployed_by`). The claim labelled a claim — #447's principle kept (nothing claimed dressed as proven), its in-file wording revised.
3. Lock holder = `<session> (<observed identity>)` so a concurrency refusal names the session.
4. Sweep all prescriptive command sites to `dt-deploy <full-40-char-sha> --by <session>`; #649 completion report annotated (frozen record, not rewritten).
5. Install the new blob to `/usr/local/bin/dt-deploy` from the git object at the pushed sha; verify sha256 == blob. **No app deploy needed** — zero server-code change, zero trading-path surface.

## Verification
- Provoked refusal: invocation WITHOUT `--by` refuses with the usage line.
- Provoked refusal: bad charset refuses.
- Record-shape check on next real deploy (the daily observation picks it up).
- Wide grep: no prescriptive site still shows the flagless form.

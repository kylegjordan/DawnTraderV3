# Pricing architecture review submission

Completed 2026-09-08 for `CODEX_PRICING_ARCHITECTURE_BRIEF.md`.

**Disposition: revise the architecture document before making it canonical.** The report separately answers (a) current-state verification, (b) the recommended state by job and lane, and (c) disagreements with the authors' proposals. It includes agreement where supported, explicit uncertainty, and a replacement feed-comparison methodology. No code change or deployment is proposed as already approved or completed.

## Deliverables

- `REPORT.md`: findings, supporting code citations, recommended contracts and disagreements.
- `QUESTIONS.md`: raw evidence requests to resolve runtime incidence, data quality, execution realism and feed choice.
- `PROBE_RESULTS.json` and `probes.mjs`: seven passing focused executable checks, with extraction/stub limitations stated.
- `CITATION_CHECK.json`: 102 checked code/document line references. Links in the report use the immutable repository SHA.
- `pinned-source/`: 43 exact source/document copies used for review and local reproduction.
- `FINAL_PROVENANCE.json`: source-copy SHA-256 hashes, final branch/head/status and status warnings.
- `OLDER_REF_CHECK.json`: four important discrepancies independently checked at the older ref cited by the document.
- The named census JSON files, `census.py` and `read_pin.py`: search reach, positive controls and reproducible pinned reads.
- `finalize.py`: citation resolution and read-only source verification. Running it refreshes verification metadata; it does not modify the source repository.

## Source integrity

Repository: `https://github.com/kylegjordan/DawnTraderV3.git`  
Branch: `migration/aws-supabase`  
Pinned SHA and final HEAD: `9c2b50e7391758ef7fd2df0a48f0368fbcef13e0`

Initial and final `git status --porcelain` were identical:

```text
?? .claude/launch.json
```

Git emitted a permission warning for the global ignore file at `C:\Users\kyleg/.config/git/ignore`; its full stderr is retained. No source files, Git configuration, credentials or runtime settings were changed. Existing untracked content was not used as evidence.

## Frozen report hashes

SHA-256:

```text
REPORT.md
e2b69b8c5c7f45fa44d4723a3ab44cd22d909e547720f53050eb8bf00b1180f3

QUESTIONS.md
4764708bd64bbf8fdb679aea617272827c6a3a61b1c6b4d7527f15b1c070bf26

PROBE_RESULTS.json
940e4bcceeefa57a81d7c0b82275e851fbd2ce1087e59a9b46ee6a561da7c7c1
```

The frozen report is a review of the named document and pinned code. Earlier assignments and fee screenshots were not substituted for current deployment or execution evidence. Historical measurements quoted by the authors remain unverified here unless expressly identified as a reproduced code mechanism.

## Reproducing the focused checks

Use Node.js 24, which provides the built-in TypeScript stripping used by this harness. Run `probes.mjs` from this folder with its accompanying `pinned-source` directory. The harness imports pinned pure functions and extracts two methods into controlled fixtures; it does not start DawnTrader, connect to a database or call Kraken. Seven checks pass. No application-wide integration, production-load, strategy-profitability or venue-execution test is claimed.

The review is complete. Further conclusions about the best live feed configuration, frequency of the identified mechanisms or effect on returns require the raw evidence listed in `QUESTIONS.md`. No additional trading activity is requested.

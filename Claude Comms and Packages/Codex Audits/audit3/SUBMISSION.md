# Assignment 3 — frozen submission

**Frozen at:** 2026-09-06T10:41:07.700513+00:00
**Source pin claimed by read-only export:** `d0eda8ae4ab86e5968f08710be8e382a946126fd`.
**Brief:** `CODEX_AUDIT_3_BRIEF.md`, title ends `(r3)`; literal nested path absent.
**Git verification:** both `git rev-parse HEAD` and `git status --porcelain` fail because the export contains no `.git`. No clean status or independent git-object verification is claimed.

## Deliverables

| File | SHA-256 |
|---|---|
| REPORT.md | `084ff2d1a3de3e251d909676f0c6d58c0f6099e2f138b62497048f46ba086ba8` |
| QUESTIONS.md | `299fe64463f6a545857d246bec1406e0df7a473482770ae35e4fe537a3627f2e` |
| ARTIFACT_SHA256.json | `dd66690a12a8aa79662d24a97d80a8ef9835bc202fa1ba6f50b9a5731dd37abd` |
| STAGE_A_PRICE.md | `4cd9f8b3578534651dbc73c504851f2a3fa9a8df60864a66f87276e83a18b992` |
| STAGE_A_RESTORED.md | `61a36aa7be9d0b3b328659684c9da523c6e609d9ed2171482a199f318b10acd9` |

The artifact manifest covers 40 files, including all measurements, code, reading records and report/question text. It excludes itself and this submission record to avoid recursive hashes. The source index covers 25 inspected source files; all were unchanged at final validation. All 9 data input files were rehashed and remain identical to the initial data profile.

## Standing and limitations

This is a completed **bounded audit submission**, including explicit INSUFFICIENT/REFUSE outcomes and requests for the missing primitives. It is not a claim that every empirical question has been answered. No designs, source/data modifications, deployments, account operations or trades were performed. No per-strategy net-EV ranking was computed, even as an intermediate.

**Strict blind independence was not fully achieved.** The DHMA and price proposals were exposed during staged reads because the brief combines or precedes the questions with those statements. The report does not count the recorded derivations as blind agreement. Section 2.b supplies no separately withheld second interpretation after its question paragraphs. READING_LOG.md and QUESTIONS.md #0 state what a fresh reader needs to restore the strict gate. The Stage-A records above are retained byte-for-byte, and subsequent qualifications are labelled separately.

Measurement checks: 16 independent datetime/window checks, two Q1 reconciliation checks and exact settlement checks for 57 fee scenarios passed. A datetime-unit issue found during measurement verification was corrected before final reporting. Application tests/live integration were not run; no corresponding claim is made.

**Frozen before any comparison with previous assignment reviews; no such comparison occurred.** Do not revise REPORT.md to assimilate later evidence. Any response to QUESTIONS.md belongs in a labelled supplement with its own evidence window, source identity and hash.

from pathlib import Path
from datetime import datetime,timezone
import hashlib,json
O=Path(__file__).parent
assert not (O/'SUBMISSION.md').exists(), 'Already frozen; issue a supplement instead'
assert (O/'REPORT.md').stat().st_size>30000
assert (O/'QUESTIONS.md').stat().st_size>1000
expected={'STAGE_A_PRICE.md':'4cd9f8b3578534651dbc73c504851f2a3fa9a8df60864a66f87276e83a18b992','STAGE_A_RESTORED.md':'61a36aa7be9d0b3b328659684c9da523c6e609d9ed2171482a199f318b10acd9'}
for f,h in expected.items():assert hashlib.sha256((O/f).read_bytes()).hexdigest()==h
data=json.loads((O/'data_profile.json').read_text(encoding='utf-8'))['hashes']
for name,record in data.items():
    h=hashlib.sha256()
    with (Path('C:/DawnTrader-Codex-Data')/name).open('rb') as fp:
        for b in iter(lambda:fp.read(4*1024*1024),b''):h.update(b)
    assert h.hexdigest()==record['sha256'],f'Input changed: {name}'
hashes={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(O.iterdir()) if p.is_file() and p.name not in ['SUBMISSION.md','ARTIFACT_SHA256.json']}
(O/'ARTIFACT_SHA256.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
manifest_hash=hashlib.sha256((O/'ARTIFACT_SHA256.json').read_bytes()).hexdigest()
now=datetime.now(timezone.utc).isoformat()
submission=f'''# Assignment 3 — frozen submission

**Frozen at:** {now}
**Source pin claimed by read-only export:** `d0eda8ae4ab86e5968f08710be8e382a946126fd`.
**Brief:** `CODEX_AUDIT_3_BRIEF.md`, title ends `(r3)`; literal nested path absent.
**Git verification:** both `git rev-parse HEAD` and `git status --porcelain` fail because the export contains no `.git`. No clean status or independent git-object verification is claimed.

## Deliverables

| File | SHA-256 |
|---|---|
| REPORT.md | `{hashes['REPORT.md']['sha256']}` |
| QUESTIONS.md | `{hashes['QUESTIONS.md']['sha256']}` |
| ARTIFACT_SHA256.json | `{manifest_hash}` |
| STAGE_A_PRICE.md | `{expected['STAGE_A_PRICE.md']}` |
| STAGE_A_RESTORED.md | `{expected['STAGE_A_RESTORED.md']}` |

The artifact manifest covers {len(hashes)} files, including all measurements, code, reading records and report/question text. It excludes itself and this submission record to avoid recursive hashes. The source index covers 25 inspected source files; all were unchanged at final validation. All {len(data)} data input files were rehashed and remain identical to the initial data profile.

## Standing and limitations

This is a completed **bounded audit submission**, including explicit INSUFFICIENT/REFUSE outcomes and requests for the missing primitives. It is not a claim that every empirical question has been answered. No designs, source/data modifications, deployments, account operations or trades were performed. No per-strategy net-EV ranking was computed, even as an intermediate.

**Strict blind independence was not fully achieved.** The DHMA and price proposals were exposed during staged reads because the brief combines or precedes the questions with those statements. The report does not count the recorded derivations as blind agreement. Section 2.b supplies no separately withheld second interpretation after its question paragraphs. READING_LOG.md and QUESTIONS.md #0 state what a fresh reader needs to restore the strict gate. The Stage-A records above are retained byte-for-byte, and subsequent qualifications are labelled separately.

Measurement checks: 16 independent datetime/window checks, two Q1 reconciliation checks and exact settlement checks for 57 fee scenarios passed. A datetime-unit issue found during measurement verification was corrected before final reporting. Application tests/live integration were not run; no corresponding claim is made.

**Frozen before any comparison with previous assignment reviews; no such comparison occurred.** Do not revise REPORT.md to assimilate later evidence. Any response to QUESTIONS.md belongs in a labelled supplement with its own evidence window, source identity and hash.
'''
(O/'SUBMISSION.md').write_text(submission,encoding='utf-8')
print(json.dumps({'frozen_at':now,'report_sha256':hashes['REPORT.md']['sha256'],'questions_sha256':hashes['QUESTIONS.md']['sha256'],'artifact_files':len(hashes),'input_files_reverified':len(data)},indent=2))

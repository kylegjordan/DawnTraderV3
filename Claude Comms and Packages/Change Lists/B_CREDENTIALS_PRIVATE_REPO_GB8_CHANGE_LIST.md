# B-CREDENTIALS-PRIVATE-REPO — GB-8 BRIDGES INCREMENT

**Owner:** INFRA Codex (`codex-infra`) · **Parent:** `B-CREDENTIALS-PRIVATE-REPO` / `#1023` · **Change class:** `non_architecture` · **Scope and Step-2 reference:** `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` and `B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` (GB-8; Langston's gate-4a-2 rider requires `discord.py` pinning in this bridges increment).

## STEP 3 — IMPLEMENTATION

The bridge installer previously requested `discord.py>=2.3`, so running an already-reviewed installer later could silently add a newer dependency release. The Helsinki bridge venv read `discord.py 2.7.1` before this change. The installer now carries `2.7.1` as an exact reviewed version input, asks pip for `discord.py==2.7.1`, and refuses before bridge files install if the imported result is any other version.

`comms-infra/helsinki/tests/deploy_tests.sh` adds two discriminating checks: a simulated `2.7.0` result must refuse before bridge-file installation, and the pip stub must receive exactly `install -U discord.py==2.7.1`. Its positive control reads the pre-GB-8 installer and finds the former unbounded `discord.py>=2.3` requirement.

No bridge package was installed and no service was installed, restarted or enabled in Step 3. The later Step-6 bridges install remains gated on review, CI, an empty review queue, and the Codex-shift rule that Langston stays off.

**Step-3 evidence:** implementation ref `2b1c83999837c787b7fce277fa5f3663053dc449` is pushed. Both edited shell files pass `bash -n`. The committed root-isolated installer suite ran on Helsinki from that exact ref and passed 66/66 assertions, including `GB8-D1`, `GB8-D2`, and the pre-change `GB8-D2 CONTROL`. It ran under a private `/tmp/dtr-gb8.*` directory and deleted that directory in the same command; the post-run search found 0 such directories, while the same instrument found the known `/tmp/dtr-test` directory as its positive control.

**STEP: 3 of 11 COMPLETE · NEXT STEP: 4 of 11.** Dispatch the exact pushed implementation and its 66/66 suite evidence to Coltrane. Langston and both Langston workers remain off.

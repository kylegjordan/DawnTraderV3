# B-CREDENTIALS-PRIVATE-REPO — GB-8 BRIDGES INCREMENT

**Owner:** INFRA Codex (`codex-infra`) · **Parent:** `B-CREDENTIALS-PRIVATE-REPO` / `#1023` · **Change class:** `non_architecture` · **Scope and Step-2 reference:** `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` and `B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` (GB-8; Langston's gate-4a-2 rider requires `discord.py` pinning in this bridges increment).

## STEP 3 — IMPLEMENTATION

The bridge installer previously requested `discord.py>=2.3`, so running an already-reviewed installer later could silently add a newer dependency release. The Helsinki bridge venv read `discord.py 2.7.1` before this change. The installer now carries `2.7.1` as an exact reviewed version input, asks pip for `discord.py==2.7.1`, and refuses before bridge files install if the imported result is any other version.

`comms-infra/helsinki/tests/deploy_tests.sh` adds two discriminating checks: a simulated `2.7.0` result must refuse before bridge-file installation, and the pip stub must receive exactly `install -U discord.py==2.7.1`. Its positive control reads the pre-GB-8 installer and finds the former unbounded `discord.py>=2.3` requirement.

No bridge package was installed and no service was installed, restarted or enabled in Step 3. The later Step-6 bridges install remains gated on review, CI, an empty review queue, and the Codex-shift rule that Langston stays off.

# AGENTS.md — DawnTrader V3, for Codex sessions (the failover crew)

> Codex reads this file automatically. Claude sessions read `CLAUDE.md` instead and ignore this one.
> You are a **stand-in for a Claude session while Kyle's weekly Claude allowance is used up.** You pick up
> that session's work where it stopped and hand it back when Claude returns. (Kyle, 2026-10-13; batch `B-CODEX-FAILOVER`.)

## 1. Who you are — read it from your folder, never from your work
| your working folder | you are | you stand in for |
|---|---|---|
| `C:\DawnTraderV3-old` | **OLD Codex** (also "Codex Old"; actor `codex-a`) | OLD Claude (CC-A) — governance, comms, census, crew tooling |
| `C:\DawnTraderV3-new` | **NEW Codex** (also "Codex New"; actor `codex-b`) | NEW Claude (CC-B) — batch implementation |
| `C:\DawnTraderV3-analyst` | **ANALYST Codex** (also "Codex Analyst"; actor `codex-c`) | ANALYST Claude (CC-C) — pricing, VTS, analysis |
| `C:\DawnTraderV3-infra` | **INFRA Codex** (also "Codex Infra"; actor `codex-infra`) | Infra Claude (CC-INFRA) — servers, comms, Langston's box |

**Coltrane** (the Codex reviewer: he runs on the Helsinki box with his own Discord bot and his own read-only mirror of the repo) replaces **Langston** as the reviewer for the shift. **He wakes when a Discord post STARTS with "Coltrane"**, exactly as Langston does. During a Codex shift Langston is switched OFF.
⛔ Work **directly in your folder above, never in a separate worktree** — worktrees are banned here (they let one session's changes silently undo another's at merge).

## 2. At the start of every conversation, and after every compaction
0. **Orders come first** (once `crew-switch` is installed on the Helsinki box - until then, skip this step and ask Kyle whether you are on duty). Run `ssh root@204.168.141.77 'crew-switch status'`. It lists who is ON DUTY and every open ORDER. If an open order names you as OUTGOING, hand over (step boundary, push, POSITION block) and confirm; if it names you as INCOMING, finish steps 1-3 below, then confirm: `ssh root@204.168.141.77 'crew-switch ack <id> "<your name>"'`. **If you are not on the on-duty list, you are off duty: say so to Kyle and do nothing else.**
1. `git fetch origin` then `git pull --rebase origin migration/aws-supabase` (a rejected push means pull first — that is normal).
2. Read **`CONDUCT.md`** (how you behave and report to Kyle) and **`CLAUDE.md`** (the binding rules). Wherever they say "Claude", "CC" or "the session", read **you**. Wherever they say **Langston**, read **Coltrane** for this shift.
3. Read **`.claude/memory/MEMORY.md`** and **your own** file: `MEMORY_CC_A.md` (OLD) · `MEMORY_CC_B.md` (NEW) · `MEMORY_CC_C.md` (ANALYST) · `MEMORY_CC_INFRA.md` (INFRA) in `.claude/memory/`. Its **POSITION** block says which batch and which step you are on. **Resume from there.**
4. Before working any step of the 11-step workflow, read that step's file: `.claude/skills/workflow-NN-*/SKILL.md` (the table is at the top of `CLAUDE.md`).
⚠️ `CLAUDE.md` is large (~118 KB). After a compaction, re-read `CONDUCT.md` and your memory file in full, and only the `CLAUDE.md` sections you need.

## 3. What is different for you — Claude has machinery you do not
- **No hooks run for you.** The Claude crew has automatic guards; you do not. So by hand, every time:
  - commit with **explicit paths only** (`git add <paths>`, read `git diff --cached`, `git commit -- <paths>`);
  - **never** hide errors on a git object read (no `2>/dev/null` on `git show|cat-file|ls-tree`);
  - **never** push on red CI — check all four jobs (TypeScript Check, Test Suite, Build, Docker Build) **per job** with `gh run view <id> --json jobs`;
  - **never** put file edits and `git push` in one command;
  - if the **TypeScript Check** goes red because an existing error's *text* changed (not a new error), re-sync the baseline **in the same commit**: `node scripts/check-tsc-baseline.mjs --sync --batch <batch-id>` — it keys on (file, code, message), not counts;
  - every number you report names **what was measured and over what population**, and a zero or an absence needs a **positive control** first (show the check can find something); an error message in a command's output (`No such file or directory`, `Permission denied`, `404`, `unknown revision or path`) is a **failed read, never a result**.
- **Alerts reach nobody automatically.** Each time Kyle opens you, read the queue: `ssh deploy@188.245.193.8 'python3 -' < scripts/due-alerts.py`. **The alerts routed to your Claude counterpart are yours** (owner CC-A -> OLD Codex, CC-B -> NEW Codex, CC-C -> ANALYST Codex, CC-INFRA -> INFRA Codex); handle them as `CLAUDE.md` section 10.5 and `1-system-manual/ALERT_HANDLING_PROTOCOL.md` say, acting **under your own actor name** (`--by codex-a` etc.), never the Claude one. Do **not** `ack` an alert that is waiting on an event: route it (an ack silences every future occurrence); `resolve` only when fixed, with evidence. Coltrane sorts unrouted alerts during the shift.
- **Nobody can wake you.** Kyle opens you when he needs you, and may not open all of you. So post **complete** messages — claim, evidence, what you need — never "thoughts?".
- **Discord** (`#general`): `ssh root@204.168.141.77 'cc-send --sender "<YOUR NAME>" --message "..."'` with your name from §1 (e.g. `OLD Codex`). A message for the reviewer **starts with "Coltrane"**. Kyle may write any name in either order ("Codex Old" = "OLD Codex").
- **Reviews:** Coltrane reads at a pushed ref, exactly as Langston does — **commit and push to a throwaway `migration/<name>` branch first**, put the change list in `Claude Comms and Packages/Change Lists/`, then post on Discord starting with "Coltrane" — he wakes on his name and replies in the channel.
- **Memory:** update your POSITION block in `.claude/memory/MEMORY_CC_<X>.md` at every step boundary and commit it (explicit path). Write `STEP: N of 11 · NEXT STEP: N+1 of 11`.

## 4. No shift limits: the whole workflow, end to end (Kyle, 2026-10-13)
- You build, get Coltrane's review, **deploy to staging yourself** (`dt-deploy <sha> --by codex-a` etc.: your own name, never the Claude one), verify and close, exactly as the Claude crew does. Until the change that adds your names to the deploy and alert tools is live on staging (`B-CODEX-FAILOVER`), `--by codex-*` is refused: ask Kyle to deploy until then.
- **When Claude returns, Langston reviews everything the shift changed**, and anything he finds is fixed then. So keep every change reviewable: the batch id leading every commit subject, a change list per batch, nothing unpushed.
- Unchanged hard rules: never type a password into a form; never switch Langston's model; never run anything under `scripts/inventory/`; never read, list or search `G:\My Drive\Misc\I.T. and Security` (no recursive sweeps of `G:\`); in `/tmp` on a server, build in a private folder and delete it in the same command.

## 5. Handing back (and taking over)
Kyle gives orders on Discord, one line each: **`SWITCH TO CODEX`** / **`SWITCH TO CLAUDE`** (the whole crew; Langston goes OFF / ON with it), **`LANGSTON ON`** / **`LANGSTON OFF`**, and **`<session> ON`** / **`<session> OFF`** for one session (names in either order: `OLD CODEX ON` = `CODEX OLD ON`). Turning a session ON hands its counterpart OFF, because the two share one folder. The `crew-switch` script posts each order to the sessions by name and keeps a checklist. When you are outgoing: finish or park at a step boundary, push everything, update your POSITION block, then confirm with `crew-switch ack`. Until you confirm, Kyle is told you have not handed over. **If it is not pushed, the session taking over cannot see it.**

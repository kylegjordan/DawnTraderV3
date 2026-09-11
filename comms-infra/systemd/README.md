# Helsinki agent host config — Langston and Coltrane

> **These are EXACT copies taken off `204.168.141.77` on 2026-09-11 with `tar`, not retyped.**
> Retyping is how the record and the running system drift apart. Edit here, then install;
> after installing, re-run `comms-infra/tools/verify-agent-artifacts.py`.

## Install map

| repo | host |
|---|---|
| `systemd/*.service`, `systemd/*.timer` | `/etc/systemd/system/` |
| `systemd/onfailure.conf` | `/etc/systemd/system/<unit>.service.d/onfailure.conf` for each SCHEDULED job below |
| `systemd/coltrane-bot.service.d/onfailure.conf` | `/etc/systemd/system/coltrane-bot.service.d/onfailure.conf` |
| `tools/agent-unit-failure-alert` | `/usr/local/bin/agent-unit-failure-alert` (755) |
| `tools/agent-work-sync` | `/usr/local/bin/agent-work-sync` (755) |
| `langston-memory/bin/langston-privacy-check` | `/usr/local/bin/langston-privacy-check` (**750 root:root** — a root-only tool; installed that way 2026-09-11, and 755 would be a needless reader class. Langston Step-6 FINDING-8: this cell said 755 while the live file and the SIM said 750); its `.service` also gets `onfailure.conf` |

Then `systemctl daemon-reload`.

---

## ⛔⛔ HOST CONFIG THAT IS NOT A FILE HERE — AND IT IS THE ONE THAT BROKE

```
git config --system --add safe.directory /srv/dawntrader-backup.git
git config --system --add safe.directory /srv/coltrane-repo.git
```

**`--system`, never `--global`.** On 2026-09-08 this was set with `--global`, which writes
`~/.gitconfig`. A hand-run from an SSH shell has `HOME=/root` and read it; **the systemd unit has
no HOME and never did.** So `coltrane-repo-refresh` succeeded once, by hand, and then **failed on
every scheduled run for three days** with `detected dubious ownership`.

Nothing announced it. `coltrane-review` correctly **refused** to read a tree 4,429 minutes stale —
the guard worked — and nobody invoked it, so the refusal was seen by no one. Found only when Kyle
asked whether Coltrane could read the repo and the answer was re-measured instead of recalled.

★ **Reproduce a scheduled failure under the unit's conditions, not your shell's:**
`env -i PATH=/usr/bin:/bin <command>` failed with exit 128 before the fix and passed after it.

---

## Failure pages — two mechanisms, deliberately, and why they differ

| covers | template | where it posts | pages Kyle's phone? |
|---|---|---|---|
| **Long-running bots** — `coltrane-bot`, `discord-langston-bridge`, `discord-cc-bridge` | `discord-bridge-failed-notify@.service` (pre-existing, #462) | crew channel, 🚨 | **yes** (`--notify`) |
| **Scheduled jobs** — the six timers below, plus `agent-work-sync` | `agent-unit-failure@.service` → `agent-unit-failure-alert` | crew channel | no |

**The split is urgency, not history.** A bot only reaches `failed` after crash-looping past its
start limit and **stopping** — the agent is now unreachable, which is worth waking someone for. A
missed scheduled job is worth knowing about and is not worth a phone push at 05:40Z.

**Proof, and what was deliberately NOT done:**
- **Scheduled-job page:** drilled end to end on 2026-09-11. A unit running `/bin/false` triggered
  it, and **Discord itself returned the message** (id `1547952129770131539`), checked alongside a
  known-delivered control message. ⚠️ My first check of the channel log found **zero** rows. The row
  existed; my filter didn't. The log stamps `12:49:07.426874+00:00`, I compared against
  `12:49:07Z`, and at that character `.` sorts before `Z` — so the filter excluded the exact row.
- **Bot page:** **NOT drilled.** It @-mentions Kyle and pushes to his phone, so a drill is a fake
  page. It **fired for real on 2026-07-13** for `discord-cc-bridge` and delivered
  (`sent id=1526170990906966116`) — that is the proof.
- Adding `OnFailure=` to the running bot did **not** restart it: restarts 0 → 0, up-since unchanged.
  It is a `[Unit]` property and applies on `daemon-reload`.

## `SuccessExitStatus=0 1` on both size watches

Both watches **exit 1 on a BREACH by design** — the watch ran correctly and found something.
Without this line systemd marks every breach day `failed`, **so a genuine crash and a correct
breach read identically in `systemctl`** — which is exactly why a status table on 2026-09-11 could
not tell them apart. `coltrane-size-watch` had it from the start; `langston-size-watch` gained it
2026-09-11. **Proven on a transient unit with the same setting:** `exit 1` → `success`,
`exit 2` → still `exit-code`. ⚠️ Only after this line exists is it safe to put `OnFailure=` on a size
watch — otherwise every breach day pages.

## `agent-work-sync` — the agents' authoring base

Keeps `DawnTraderV3-agent-work:migration/aws-supabase` **equal** to
`DawnTraderV3:migration/aws-supabase`, every 15 minutes, as `coltrane`.

- **Fast-forward only.** If the work branch has commits the real one lacks it **refuses, exit 3**,
  and the failure page fires. The agents are told never to push there, so divergence means
  something is wrong — overwriting would destroy the evidence.
- **Why it exists:** on 2026-09-11 Coltrane's clone was **three days behind** the real code and
  parked on a leftover test branch. Nothing kept the two repos in step. **Coltrane flagged the
  mismatch itself** when asked to verify, and said pull alone did not establish sync.
- **`Environment=HOME=/home/coltrane` is explicit** — the lesson from the refresh failure above.
- **Proven on throwaway local repos, nothing on GitHub touched:** identical → `IN SYNC`;
  real ahead → `ADVANCED` to equal; diverged → `DIVERGED`, exit 3, **and the work-only commit
  survived**.

## ⚠️ Honest limits

- The six scheduled pages prove **delivery**, not that every job's failure mode reaches `failed` —
  a job that exits 0 while doing the wrong thing pages nobody. Each tool's own refusals are what
  cover that.
- `langston-size-watch`'s unit change is confirmed by its property and the transient proof; its
  first real `success`-while-`BREACH` run is the next 05:40Z timer.
- `AGENT_CLONE_README.md` in each authoring clone is excluded via `.git/info/exclude` — local
  only, so it cannot be committed into the work repo and carried into the real one by a merge.

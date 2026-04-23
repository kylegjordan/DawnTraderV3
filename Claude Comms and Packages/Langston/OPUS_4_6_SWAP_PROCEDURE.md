# Langston Brain Swap: GPT-5.4 → Opus 4.6

**Prepared:** 2026-04-22 by Claude Code
**Trigger:** Apply AFTER Langston closes B63 Item 18 on GPT-5.4 (clean boundary — do not swap mid-audit)
**Reversibility:** Fully reversible. One-line config change, one PM2 restart.
**Server impact:** Affects ONLY 204.168.141.77 (Langston's OpenClaw gateway). The DawnTrader staging server at 188.245.193.8 is untouched.

---

## Why Opus 4.6

- **Context:** 977K (OpenClaw catalog) vs 266K on GPT-5.4 — 3.7× expansion, directly addresses the "Langston runs out of context" problem
- **Pricing:** $5/M input, $25/M output. Roughly $30/mo at current usage, $60/mo at 2× — in the same band as current GPT-5.4 spend
- **No infrastructure change:** already enabled in `agents.defaults.models` in `/root/.openclaw/openclaw.json`
- **Family alignment:** Anthropic's Claude family tracks Claude Code's reasoning patterns more closely than OpenAI's GPT-5.4; three-way technical loops should converge faster

---

## Apply procedure

### Step 1 — Back up config

```bash
ssh root@204.168.141.77 'cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.pre-opus-swap-2026-04-22'
```

### Step 2 — Swap primary model

```bash
ssh root@204.168.141.77 '
python3 -c "
import json, pathlib
p = pathlib.Path(\"/root/.openclaw/openclaw.json\")
d = json.loads(p.read_text())
old = d[\"agents\"][\"defaults\"][\"model\"][\"primary\"]
d[\"agents\"][\"defaults\"][\"model\"][\"primary\"] = \"anthropic/claude-opus-4-6\"
p.write_text(json.dumps(d, indent=2))
print(f\"Changed primary from {old} to anthropic/claude-opus-4-6\")
"
'
```

### Step 3 — Restart OpenClaw gateway

```bash
ssh root@204.168.141.77 'systemctl restart openclaw-gateway && sleep 3 && openclaw health 2>&1 | head -5'
```

Expected output: `telegram: ok (@LangstonDTBot)` — confirms the gateway re-booted cleanly on the new model.

### Step 4 — Verify model swap took effect

```bash
ssh root@204.168.141.77 'openclaw agents status --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps([a for a in d if a.get(\"id\")==\"main\"], indent=2))"'
```

Confirm the `main` agent's `model` field reads `anthropic/claude-opus-4-6`.

### Step 5 — Reset Langston session (clean boundary)

The existing session's message history was produced by GPT-5.4 and carries its reasoning style. Reset for clean swap:

```bash
ssh root@204.168.141.77 '
cd /root/.openclaw/agents/main/sessions/
mv ba777106-737b-4562-8353-e70e513ef53a-topic-21.jsonl ba777106-737b-4562-8353-e70e513ef53a-topic-21.jsonl.reset.opus-swap-2026-04-22
'
```

### Step 6 — Re-deliver a fresh handoff

Same three-file load as the 2026-04-22 reset (BOOTSTRAP → MEMORY → active-brief), plus a one-line addendum: "You are now running on Anthropic Claude Opus 4.6 (977K context via OpenClaw). The 272K cap is gone."

### Step 7 — Observe for 48h before declaring success

Watch for:
- First-response acknowledgment quality vs GPT-5.4 baseline
- Pushback / alternative-proposal rate on scope reviews
- Code-diff review depth
- Audit-doc writing structure

If Opus 4.6 underperforms GPT-5.4 on any of these within 48h, revert via step 8.

### Step 8 — Rollback procedure (if needed)

```bash
ssh root@204.168.141.77 '
cp /root/.openclaw/openclaw.json.pre-opus-swap-2026-04-22 /root/.openclaw/openclaw.json
systemctl restart openclaw-gateway
'
```

Fully restores the pre-swap state. Sessions that were active during the swap remain archived with `.reset.opus-swap-2026-04-22` suffix for forensic review.

---

## Decision gate before applying

Apply ONLY when ALL of the following are true:
1. Langston has closed B63 Item 18 audit (SQE deliverable complete at `B63_ITEM18_SQE_AUDIT.md`)
2. No active Langston task that would be disrupted by a 30-second gateway restart
3. Kyle has given explicit "apply" greenlight on this session or a follow-up

Do NOT apply during the 2026-04-21 → 2026-04-28 observation window if an open-book crisis emerges and Langston is actively reviewing evidence. The cognitive discontinuity during a model swap is real and not a moment for in-flight analysis work.

---

*End of procedure.*

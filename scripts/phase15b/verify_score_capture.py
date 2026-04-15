#!/usr/bin/env python3
"""Quick verification that post-restart VTS trades carry the new DBS score fields."""
import json
import sys

# PM2 restart at approximately 2026-04-15 13:28 UTC → epoch ms 1776259680000
RESTART_MS = 1776259680000

path = sys.argv[1] if len(sys.argv) > 1 else "logs/virtual_trades/2026-04-15.json"
with open(path) as f:
    data = json.load(f)

print(f"total_trades: {len(data)}")
post_restart = [t for t in data if t.get("exitTime", 0) >= RESTART_MS]
print(f"post_restart_trades: {len(post_restart)}")

with_score = sum(1 for t in post_restart if t.get("pairDirectionalBiasScore") is not None)
print(f"with_pairDirectionalBiasScore: {with_score}/{len(post_restart)}")

if post_restart:
    sample = post_restart[-1]
    print()
    print("=== latest post-restart trade ===")
    print(f"  exitTime (ms):               {sample.get('exitTime')}")
    print(f"  pairDirectionalBias:         {sample.get('pairDirectionalBias')}")
    print(f"  pairDirectionalBiasScore:    {sample.get('pairDirectionalBiasScore')}")
    print(f"  globalDirectionalBias:       {sample.get('globalDirectionalBias')}")
    print(f"  globalDirectionalBiasScore:  {sample.get('globalDirectionalBiasScore')}")

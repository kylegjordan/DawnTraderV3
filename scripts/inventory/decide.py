"""Record item-by-item bucket decisions. Usage: python decide.py <chunk_file.json>
Each decision: key -> [bucket, reason, flag]. Buckets:
  MUST · HELPFUL · AFTER · OBSERVATION (runs itself) · DECIDE (a Kyle decision, not a batch)
  PRUNE (done / superseded / umbrella) · MERGE:<key> (duplicate of another item)
Flags: "verify" = I believe it is done/stale but its owner must confirm;  "" = confident read."""
import io, json, os, sys
OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
path = os.path.join(OUT, "decisions.json")
dec = json.load(io.open(path, encoding="utf-8")) if os.path.exists(path) else {}
new = json.load(io.open(sys.argv[1], encoding="utf-8"))
dec.update(new)
json.dump(dec, io.open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("decisions recorded:", len(dec), "(+%d this chunk)" % len(new))

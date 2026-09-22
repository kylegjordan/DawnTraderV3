"""Print a compact review sheet for one slice of the REVIEW items, so each can be read and bucketed."""
import io, json, os, sys
OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
items = json.load(io.open(os.path.join(OUT, "items_v3.json"), encoding="utf-8"))
phase, lo, hi = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
rev = [i for i in items if i["bucket"] == "REVIEW" and i["phase"] == phase]
rev.sort(key=lambda x: (x["row"] or "zz", x["key"]))
print(f"{phase}: {len(rev)} to review — showing {lo}..{min(hi, len(rev))}")
for n, it in enumerate(rev[lo:hi], lo):
    st = (it.get("status_text") or "")[:70]
    print(f"[{n}] {it['key']} | row={it['row']} | {it['owner']} | st={st}")
    print(f"     {it['text'][:300]}")

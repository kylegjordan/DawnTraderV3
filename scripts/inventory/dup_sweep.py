"""Sweep for plan rows the extractor dropped because a row id is reused. For every PHASE_19_PLAN table row
(read at the ref) name its primary batch and check whether the inventory holds it by key, name, or any text."""
import io, json, re, os, subprocess, collections
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = r"C:\DawnTraderV3-new"
subprocess.check_call(["git", "-C", REPO, "fetch", "-q", "origin"])
sha = subprocess.check_output(["git", "-C", REPO, "rev-parse", "origin/migration/aws-supabase"], text=True).strip()
L = subprocess.check_output(["git", "-C", REPO, "show", f"{sha}:1-system-manual/PHASE_19_PLAN.md"], text=True, encoding="utf-8").split("\n")
items = json.load(io.open(os.path.join(HERE, "items_v3.json"), encoding="utf-8"))
manual = set(json.load(io.open(os.path.join(HERE, "manual_keys.json"), encoding="utf-8")))
keys = {i["key"] for i in items} | manual
names = {(i.get("name") or "") for i in items} | manual
blob = json.dumps(items, ensure_ascii=False)
# table boundaries: header row = a '|' line followed by a '|---' line
tables, cur = [], None
for n, l in enumerate(L, 1):
    s = l.lstrip("> ").strip()
    if s.startswith("|"):
        if cur is None: cur = {"start": n, "header": s[:80], "rows": []}
        c = [x.strip() for x in s.strip("|").split("|")]
        if not set(c[0]) <= set("-: "): cur["rows"].append((n, c))
    elif cur is not None:
        tables.append(cur); cur = None
if cur: tables.append(cur)
ids = collections.Counter()
for t in tables:
    for n, c in t["rows"][1:]: ids[re.sub(r"[*`~]", "", c[0]).strip()] += 1
dups = {k for k, v in ids.items() if v > 1}
print(f"read at {sha[:9]}; tables {len(tables)}; duplicated row ids {len(dups)}")
for t in tables:
    print(f"\n# table L{t['start']}: {t['header']}")
    for n, c in t["rows"][1:]:
        rid = re.sub(r"[*`~]", "", c[0]).strip()
        m = re.search(r"(B-[A-Z0-9][A-Z0-9-]+|P19-B[0-9][0-9.a-z]*|F-G-[0-9]|F-[0-9A-F](?:\([a-z]\))?)", " ".join(c[:2]))
        nm = m.group(1) if m else ""
        held = (nm and (nm in keys or nm in names)) or (f"row:{rid}" in keys and not nm)
        in_blob = bool(nm) and nm in blob
        if not held:
            print(f"  L{n} id={rid:12} {'DUP' if rid in dups else '   '} name={nm or '-':36} in-text={'y' if in_blob else 'n'} | {c[1][:90] if len(c)>1 else ''}")

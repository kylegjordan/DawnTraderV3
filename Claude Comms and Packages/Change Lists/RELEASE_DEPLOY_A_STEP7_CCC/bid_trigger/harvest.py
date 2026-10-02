import re, sys, json, statistics, os
START = "2026-10-02 20:37:49"
END = sys.argv[1]  # "YYYY-MM-DD HH:MM:SS"
D = "/var/log/dawntrader"
def ts(line): return line[:19]
def inwin(line): t = ts(line); return START <= t <= END
xs, broken, evalx, pre_xs, partition = [], [], [], 0, []
with open(f"{D}/error.log", "rb") as f:
    for raw in f:
        if b"[3n.q7]" not in raw and b"EVAL_PARTITION_BROKEN" not in raw: continue
        line = raw.decode("utf-8", "replace").rstrip("\n")
        if not inwin(line):
            if "[XS_FRAME]" in line: pre_xs += 1
            continue
        if "[3n.q7][XS_FRAME]" in line: xs.append((line, len(raw.rstrip(b"\n"))))
        elif "XS_FRAME_RECONCILE_BROKEN" in line: broken.append(line)
        elif "EVAL_PARTITION_BROKEN" in line: partition.append(line)
import subprocess
out = subprocess.run(["grep", "-a", "-F", "xsFrames=", f"{D}/out.log"], capture_output=True).stdout.decode("utf-8","replace").splitlines()
evalx = [l for l in out if inwin(l)]
pre_eval = len(out) - len(evalx)
open("/tmp/s7_xsframe.txt","w").write("\n".join(l for l,_ in xs)+"\n")
open("/tmp/s7_evalexit.txt","w").write("\n".join(evalx)+"\n")
open("/tmp/s7_broken.txt","w").write("\n".join(broken+partition)+"\n")
# payload lengths: full line incl pm2 prefix, and message-only (from "[3n.q7]")
full = [n for _,n in xs]; msg = [len(l[l.index("[3n.q7]"):].encode()) for l,_ in xs]
def dist(a): return dict(n=len(a), min=min(a), median=statistics.median(a), max=max(a)) if a else None
rec = ok = bad = 0; zero = 0; em_sum = inv_sum = 0; cyc = []
for l in evalx:
    m = re.search(r"xsFrames=(\d+)/(\d+) xsFrameClassMismatch=(\d+)", l)
    e, i, cm = map(int, m.groups()); em_sum += e; inv_sum += i
    m2 = re.search(r"xstock:(\d+)/(\d+)", l)
    cyc.append((ts(l), e, i, cm, int(m2.group(2))))
    if e == i: ok += 1
    else: bad += 1
    if i == 0: zero += 1
states = {}; reasons = {}; syms = {}; mism = 0; fire = {}; mexit = {}
for l,_ in xs:
    m = re.search(r"frame=(\w+)(?: reason=(\S+))?(?: basis=(\S+))?", l)
    k = m.group(1) + ("" if m.group(1)!="ok" else ":"+m.group(3))
    states[k] = states.get(k,0)+1
    if m.group(1)=="none": reasons[m.group(2)] = reasons.get(m.group(2),0)+1
    s = l.split("[XS_FRAME] ")[1].split(" ")[0]; syms[s]=syms.get(s,0)+1
    if "class_mismatch" in l: mism += 1
    b = re.search(r"bidWouldFire=(\w+)", l).group(1); fire[b]=fire.get(b,0)+1
    x = re.search(r"markExit=(\w) exitReason=(\S+)", l).groups(); mexit[x]=mexit.get(x,0)+1
reason_unset_or_missing = sum(v for k,v in reasons.items() if k in (None,"unset",""))
print(json.dumps(dict(window=[START,END], xs_lines=len(xs), xs_lines_before_start_in_errorlog=pre_xs,
  first_xs_line=xs[0][0] if xs else None, first_xs_full_bytes=full[0] if full else None, first_xs_msg_bytes=msg[0] if msg else None,
  full_bytes=dist(full), msg_bytes=dist(msg), over_375_msg=sum(1 for n in msg if n>375), over_375_full=sum(1 for n in full if n>375),
  eval_lines=len(evalx), eval_lines_before_start=pre_eval, reconcile_ok=ok, reconcile_bad=bad, cycles_invoked_zero=zero,
  emitted_sum=em_sum, invoked_sum=inv_sum, xs_lines_vs_emitted_sum=len(xs)-em_sum,
  invoked_matches_noTriggerByClass_xstock=all(c[2]==c[4] for c in cyc), classMismatch_sum=sum(c[3] for c in cyc),
  broken=len(broken), partition_broken=len(partition), states=states, frame_none_reasons=reasons, reason_unset_or_missing=reason_unset_or_missing,
  symbols=syms, class_mismatch_lines=mism, bidWouldFire=fire, markExit_exitReason={f"{a}/{b}":v for (a,b),v in mexit.items()},
  first_eval=evalx[0][:19] if evalx else None, last_eval=evalx[-1][:19] if evalx else None,
  first_xs=xs[0][0][:19] if xs else None, last_xs=xs[-1][0][:19] if xs else None), indent=1, default=str))

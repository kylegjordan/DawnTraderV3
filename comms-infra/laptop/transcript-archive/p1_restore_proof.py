"""B-TRANSCRIPT-ARCHIVE P1 (scope OBJ-1, Langston C-1): prove both Drive backups by REPRODUCTION, read-only.
Per file: backup size; laptop size + mtime; SHA-256 of the laptop file's first N bytes (N = backup size) vs the
backup copy's SHA-256. Whole-file equality only where the sizes are equal (closed conversation). No memory file
for the zip. Nothing is written anywhere except this script's stdout."""
import hashlib, os, time, zipfile, datetime as dt

PROJ = r'C:\Users\kyleg\.claude\projects'
ADD = r'G:\My Drive\Claude Code Backup Folders\Session Transcripts'
ZIP = r'G:\My Drive\Dawn Trader\claude-conversations-backup.zip'
SESS = ['C--DawnTraderV3-old', 'C--DawnTraderV3-new', 'C--DawnTraderV3-analyst', 'C--DawnTraderV3-infra',
        'C--DawnTraderV3-pm']


def sha_stream(fh, limit=None):
    h = hashlib.sha256(); n = 0
    while True:
        want = 1 << 20 if limit is None else min(1 << 20, limit - n)
        if want <= 0:
            break
        b = fh.read(want)
        if not b:
            break
        h.update(b); n += len(b)
    return h.hexdigest(), n


def utc(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def judge(label, laptop, bsize, bsha):
    st = os.stat(laptop)
    with open(laptop, 'rb') as fh:
        psha, pn = sha_stream(fh, bsize)
    state = 'closed (sizes equal)' if st.st_size == bsize else ('live (laptop longer)' if st.st_size > bsize else 'LAPTOP SHORTER THAN BACKUP')
    ok = (pn == bsize and psha == bsha)
    print(f"{label}\n  laptop {laptop}\n    size {st.st_size} mtime {utc(st.st_mtime)}\n  backup size {bsize}\n"
          f"  prefix-sha256(laptop, first {bsize} B) {psha[:16]}  backup sha256 {bsha[:16]}  -> {'MATCH' if ok else 'MISMATCH'} [{state}]")
    return ok


def pick3(cands):
    """cands: list of (rel, size, mtime). oldest by mtime, largest by size, newest by mtime - distinct where possible."""
    o = min(cands, key=lambda c: c[2]); l = max(cands, key=lambda c: c[1]); n = max(cands, key=lambda c: c[2])
    return [('oldest', o), ('largest', l), ('newest', n)]


results = []
print('=== BACKUP 2: additive copy', ADD)
cands = []
for s in SESS:
    d = os.path.join(ADD, s)
    if not os.path.isdir(d):
        print('  MISSING in backup:', s); continue
    for f in os.listdir(d):
        if f.endswith('.jsonl') and os.path.isfile(os.path.join(PROJ, s, f)):
            st = os.stat(os.path.join(d, f)); cands.append((os.path.join(s, f), st.st_size, st.st_mtime))
print('  top-level .jsonl present in both places:', len(cands))
for tag, (rel, size, mt) in pick3(cands):
    bp = os.path.join(ADD, rel)
    with open(bp, 'rb') as fh:
        bsha, bn = sha_stream(fh)
    results.append(judge(f'[additive {tag}] {rel} (backup mtime {utc(mt)})', os.path.join(PROJ, rel), bn, bsha))

print('\n=== BACKUP 1: nightly zip', ZIP, os.path.getsize(ZIP), utc(os.path.getmtime(ZIP)))
z = zipfile.ZipFile(ZIP)
zc = []
for i in z.infolist():
    name = i.filename.replace('\\', '/')
    parts = name.split('/')
    if len(parts) == 2 and parts[1].endswith('.jsonl') and parts[0] in SESS:
        if os.path.isfile(os.path.join(PROJ, parts[0], parts[1])):
            zc.append((name, i.file_size, time.mktime(i.date_time + (0, 0, -1))))
print('  entries:', len(z.infolist()), '| top-level session .jsonl also on the laptop:', len(zc),
      '| folders in zip:', sorted({i.filename.replace('\\', '/').split('/')[0] for i in z.infolist()}))
for tag, (name, size, mt) in pick3(zc):
    with z.open(name) as fh:
        bsha, bn = sha_stream(fh)
    results.append(judge(f'[zip {tag}] {name}', os.path.join(PROJ, *name.split('/')), bn, bsha))
print('\nRESULT:', sum(results), 'of', len(results), 'matched')

# §10.5 manual alert read — the fallback for when the inject-due-alerts hook says it could not run.
# Runs ON STAGING, sent over stdin so no quoting survives the trip:
#     ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py
# It reads the WHOLE file (never a tail — #980: the file is in mint order, due-ness is triggers_at,
# so a tail misses the oldest due alerts), keeps the last row per id, and prints:
#   (a) every alert that is active, unacknowledged and due — FULL id (the CLI's ack/resolve match
#       the id exactly; a prefix is a no-op), severity, title, the whole body and the metadata;
#   (b) every alert Langston acknowledged in the last 24h — his ack is not a resolve, and the
#       follow-through is usually a CC's;
# then a COUNT line naming the host. It is the positive control: no COUNT line means the read did not
# finish; a host that is not staging means a local stray copy was read. Neither is "nothing due".
import json, datetime, socket

PATH = '/var/log/dawntrader/system-alerts.jsonl'
now = datetime.datetime.now(datetime.timezone.utc)

def when(s):
    try:
        return datetime.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except Exception:
        return None

def one_line(s, n):
    return ' '.join(str(s or '').split())[:n]

last = {}
for raw in open(PATH, encoding='utf-8', errors='replace'):
    raw = raw.strip()
    if not raw:
        continue
    try:
        a = json.loads(raw)
    except Exception:
        continue
    if a.get('id'):
        last[a['id']] = a

due = []
for a in last.values():
    if a.get('state') != 'active' or a.get('acknowledged_at'):
        continue
    t = when(a.get('triggers_at') or a.get('fired_at'))
    if t is not None and t > now:
        continue
    due.append(a)

acked = [a for a in last.values()
         if a.get('acknowledged_by') == 'langston' and a.get('state') != 'resolved'
         and (when(a.get('acknowledged_at')) or now - datetime.timedelta(days=2)) > now - datetime.timedelta(hours=24)]

for a in sorted(due, key=lambda x: str(x.get('triggers_at') or '')):
    print('DUE   | %s | %s | %s' % (a.get('id'), a.get('severity'), one_line(a.get('title'), 140)))
    print('      | body: %s' % one_line(a.get('body'), 100000))
    print('      | metadata: %s' % json.dumps(a.get('metadata') or {}, ensure_ascii=False))
for a in acked:
    print('LACKED| %s | %s | %s' % (a.get('id'), a.get('severity'), one_line(a.get('title'), 140)))
print('COUNT | host=%s due=%d langston_acked_24h=%d ids=%d' % (socket.gethostname(), len(due), len(acked), len(last)))

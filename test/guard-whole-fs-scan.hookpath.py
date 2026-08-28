import json, subprocess, os
os.chdir(r'C:\DawnTraderV3-old')
HOOK = '.claude/hooks/guard-whole-fs-scan.mjs'

def run(stdin):
    p = subprocess.run(['node', HOOK], input=stdin, capture_output=True, text=True)
    return p.returncode

S = 'ssh root@204.168.141.77 '
F = 'f' + 'ind'
cases = [
    (json.dumps({'tool_input': {'command': S + "'" + F + " / -name x'"}}), 2, 'remote root scan'),
    (json.dumps({'tool_input': {'command': S + 'tail -5 /var/log/dawntrader/out.log'}}), 0, 'ordinary remote log read'),
    (json.dumps({'tool_input': {'command': S + "'" + F + " / -xdev -name x'"}}), 0, '-xdev allowed'),
    (json.dumps({'tool_input': {'command': F + ' / -name x'}}), 0, 'local scan allowed'),
    ('garbage', 0, 'malformed stdin -> fail open'),
    (json.dumps({'tool_input': {}}), 0, 'missing command -> fail open'),
]
ok = True
print('LIVE HOOK PATH (stdin -> exit code):')
for stdin, want, why in cases:
    got = run(stdin)
    good = got == want
    ok &= good
    print('  %-4s exit=%s (want %s)  %s' % ('ok' if good else 'FAIL', got, want, why))
print('\nALL HOOK-PATH CONTROLS PASS' if ok else '\nSOMETHING FAILED')

import sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
p=Path(sys.argv[1])
ranges=[tuple(map(int,x.split(':'))) for x in sys.argv[2:]]
with p.open(encoding='utf-8-sig') as f:
    for n,line in enumerate(f,1):
        if any(a<=n<=b for a,b in ranges): print(f'{n}: {line}',end='')

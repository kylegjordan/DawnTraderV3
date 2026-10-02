import re,sys,collections
pats={
 'B3_GUARDRAIL_BLOCK_MAX_TOTAL_EXPOSURE':r'\[8\.8\.3-B3\]\[GUARDRAIL_BLOCK\] code:MAX_TOTAL_EXPOSURE',
 'H4_GUARDRAIL_BLOCK_COOLDOWN':r'\[8\.8\.3-H4\]\[GUARDRAIL_BLOCK\] code:COOLDOWN',
 'H4_GUARDRAIL_BLOCK_POSITION_LIMIT':r'\[8\.8\.3-H4\]\[GUARDRAIL_BLOCK\] code:POSITION_LIMIT',
 'H4_GUARDRAIL_BLOCK_lifecycle_json':r'\[8\.8\.3-H4\]\[GUARDRAIL_BLOCK\] \{',
 'AJ16_GUARDRAIL_BLOCK':r'\[AJ16\]\[GUARDRAIL_BLOCK\]',
 'RTB_promotion_GUARDRAIL_BLOCK_text':r'Failed to execute promoted signal: GUARDRAIL_BLOCK',
 'CHECK_THREW_COOLDOWN':r'CHECK_THREW check=COOLDOWN',
 'CHECK_THREW_MAX_TOTAL_EXPOSURE':r'CHECK_THREW check=MAX_TOTAL_EXPOSURE',
 'CHECK_THREW_any':r'CHECK_THREW',
 'MAX_TOTAL_EXPOSURE_ERROR':r'MAX_TOTAL_EXPOSURE_ERROR',
 'Error_checking_cooldown':r'Error checking cooldown',
 'GUARDRAIL_READ_FAIL_any':r'GUARDRAIL_READ_FAIL',
}
cp={k:re.compile(v) for k,v in pats.items()}
cut=sys.argv[1]  # 'YYYY-MM-DD HH:MM:SS'
pre=collections.Counter(); post=collections.Counter(); hour=collections.Counter(); last={}
lastts=None
for l in sys.stdin.buffer:
    l=l.decode('utf-8','replace')
    ts=l[:19]
    if not re.match(r'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d',ts): continue
    lastts=ts
    for k,c in cp.items():
        if c.search(l):
            (post if ts>=cut else pre)[k]+=1
            hour[(ts[:13],k)]+=1; last[k]=ts
print('file last timestamp:',lastts,' cut:',cut)
print('%-40s %10s %10s %s'%('tag','pre-cut','post-cut','last seen'))
for k in pats: print('%-40s %10d %10d %s'%(k,pre[k],post[k],last.get(k,'-')))
print('\nhourly:')
for (h,k),n in sorted(hour.items()): print(h,k,n)

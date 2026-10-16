# B-XSTOCK-BID-TRIGGER-RELAND objective 6 (spread_blown arming) — CC-C 2026-10-16. Paper xStock stop_hit closes since 2026-09-19
# on a book >= 3% wide outside the US regular session: the fill vs the stop, and the next regular-session open (median
# mid of <1%-wide snaps, 09:35-10:00 ET) vs the stop and the fill. Run on staging as deploy with DATABASE_URL set.
import subprocess, datetime as dt
from zoneinfo import ZoneInfo
ET=ZoneInfo('America/New_York')
def q(sql):
    r=subprocess.run(['psql',__import__('os').environ['DATABASE_URL'],'-At','-F','|','-c',sql],capture_output=True,text=True)
    if r.returncode: raise SystemExit(r.stderr)
    return [l.split('|') for l in r.stdout.strip().splitlines() if l]
rows=q("""select symbol, closed_at, stop_loss, exit_price, (exit_ticker_ask-exit_ticker_bid)/((exit_ticker_ask+exit_ticker_bid)/2)
from closed_trades where asset_class='xstock_spot' and close_reason='stop_hit' and closed_at>='2026-09-19'
and exit_ticker_bid>0 and exit_ticker_ask>0 and (exit_ticker_ask-exit_ticker_bid)/((exit_ticker_ask+exit_ticker_bid)/2)>=0.03 order by closed_at""")
out=[]
for sym,ca,sl,ep,spr in rows:
    t=dt.datetime.fromisoformat(ca.replace(' ','T').replace('+00','+00:00')); e=t.astimezone(ET)
    m=e.hour*60+e.minute
    if e.weekday()<5 and 570<=m<960: continue
    d=e.date()
    if m>=960 or e.weekday()>=5: d=d+dt.timedelta(days=1)
    while d.weekday()>=5: d+=dt.timedelta(days=1)
    s=dt.datetime(d.year,d.month,d.day,9,35,tzinfo=ET).astimezone(dt.timezone.utc); f=s+dt.timedelta(minutes=25)
    r=q(f"select percentile_cont(0.5) within group (order by (bid+ask)/2), count(*) from xstock_spot_ticker_snap where symbol='{sym}' and captured_at>='{s.isoformat()}' and captured_at<'{f.isoformat()}' and bid>0 and ask>0 and (ask-bid)/((ask+bid)/2)<0.01")
    om=float(r[0][0]) if r and r[0][0] else None
    sl=float(sl); ep=float(ep)
    out.append((sym,e.strftime('%m-%d %H:%M ET'),round(float(spr)*100,1),round((ep-sl)/sl*100,2),None if om is None else round((om-sl)/sl*100,2),None if om is None else round((om-ep)/ep*100,2),r[0][1]))
for o in out: print('|'.join(map(str,o)))
n=[o for o in out if o[4] is not None]
print('N',len(out),'with_open',len(n),'open_above_stop',sum(1 for o in n if o[4]>=0),'open_above_fill',sum(1 for o in n if o[5]>0),'avg_open_vs_fill',round(sum(o[5] for o in n)/max(1,len(n)),2))

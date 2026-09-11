// bbo_trigger_ack_probe.mjs — ONE-OFF, READ-ONLY probe for #1017 (B-TICKER-BBO-TRIGGER).
// Question: does Kraken production accept `event_trigger: 'bbo'` on the public ticker channel?
// The archive records it once REJECTED by production v2; Kraken's docs list it now. The control the
// ledger names is a LIVE SUBSCRIBE ACK, not a doc read.
// Public endpoints only — no credentials, no orders. Prints each subscribe ack and the first update per arm.
// Arms: crypto v2 with event_trigger=bbo (treatment), crypto v2 with no event_trigger (control),
//       xStock equities endpoint with event_trigger=bbo (treatment) and without (control).
// Usage: node scripts/analysis/bbo_trigger_ack_probe.mjs [seconds=15]
import WebSocket from 'ws';

const SECONDS = Number(process.argv[2] || 15);
const ARMS = [
  { name: 'crypto-bbo', url: 'wss://ws.kraken.com/v2', symbol: 'BTC/USD', trigger: 'bbo' },
  { name: 'crypto-default', url: 'wss://ws.kraken.com/v2', symbol: 'ETH/USD', trigger: null },
  { name: 'xstock-bbo', url: 'wss://ws-equities.kraken.com', symbol: 'AAPL/USD', trigger: 'bbo' },
  { name: 'xstock-default', url: 'wss://ws-equities.kraken.com', symbol: 'MSFT/USD', trigger: null },
];

function runArm(arm) {
  return new Promise((resolve) => {
    const out = { arm: arm.name, ack: null, firstUpdate: null, updates: 0, error: null };
    let ws;
    try { ws = new WebSocket(arm.url); } catch (e) { out.error = String(e); return resolve(out); }
    const timer = setTimeout(() => { try { ws.close(); } catch { /* closing */ } resolve(out); }, SECONDS * 1000);
    ws.on('open', () => {
      const params = { channel: 'ticker', symbol: [arm.symbol], snapshot: true };
      if (arm.trigger) params.event_trigger = arm.trigger;
      ws.send(JSON.stringify({ method: 'subscribe', params, req_id: 1017 }));
    });
    ws.on('message', (buf) => {
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      if (m.method === 'subscribe') { out.ack = m; return; }
      if (m.channel === 'ticker' && Array.isArray(m.data)) {
        out.updates += 1;
        if (!out.firstUpdate) out.firstUpdate = { type: m.type, data: m.data[0] };
      }
    });
    ws.on('error', (e) => { out.error = String(e && e.message ? e.message : e); });
    ws.on('close', () => { clearTimeout(timer); resolve(out); });
  });
}

const results = await Promise.all(ARMS.map(runArm));
for (const r of results) console.log(JSON.stringify(r));

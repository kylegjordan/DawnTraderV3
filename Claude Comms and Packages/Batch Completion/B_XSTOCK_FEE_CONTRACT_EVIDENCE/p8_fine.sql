SET default_transaction_read_only = on;
SET statement_timeout = '600s';
WITH b(i, sha, t) AS (VALUES
 (0,'b597f1bf2',timestamptz '2026-09-11 20:09:47+00'),(1,'2dbc512ee',timestamptz '2026-09-12 13:32:02+00'),(2,'2ce34ce33',timestamptz '2026-09-12 23:30:25+00'),
 (3,'022fd27ad',timestamptz '2026-09-13 05:33:05+00'),(4,'cf535acb2',timestamptz '2026-09-13 07:08:40+00'),(5,'0ea7ead5b',timestamptz '2026-09-13 15:18:02+00'),
 (6,'f7d84d993',timestamptz '2026-09-14 01:14:17+00'),(7,'fc980f372',timestamptz '2026-09-14 03:16:56+00'),(8,'7d4cdf5a8',timestamptz '2026-09-14 08:34:22+00'),
 (9,'2bf7018ee',timestamptz '2026-09-14 09:25:29+00'),(10,'2fbdef295',timestamptz '2026-09-14 09:51:09+00'),(11,'a57aa209f',timestamptz '2026-09-14 10:14:30+00'),
 (12,'66ff8d702',timestamptz '2026-09-14 21:33:07+00'),(13,'7e3d64c84',timestamptz '2026-09-15 11:59:10+00'),(14,'91647c9b9',timestamptz '2026-09-15 12:14:51+00'),
 (15,'323ae2776',timestamptz '2026-09-19 00:02:18+00'),(16,'084e6605f',timestamptz '2026-09-19 00:53:53+00'),(17,'40f22a1bb',timestamptz '2026-09-20 21:19:16+00'),
 (18,'bc199185e',timestamptz '2026-09-22 14:38:33+00'),(19,'cutoff',timestamptz '2026-09-29 14:19:38+00')),
seg AS (SELECT a.i, a.sha, a.t AS s, b2.t AS e FROM b a JOIN b b2 ON b2.i = a.i + 1),
alias(symbol) AS (VALUES ('A/USD'),('ADI/USD'),('CAT/USD'),('CVX/USD'),('DASH/USD'),('EDU/USD'),('ES/USD'),('IR/USD'),('MET/USD'),('OPEN/USD'),('PEP/USD'),('STRK/USD'),('STX/USD'),('SUI/USD'),('T/USD'),('WELL/USD'),('WEN/USD'))
SELECT seg.i, seg.sha, seg.s, seg.e,
  count(e.*) FILTER (WHERE al.symbol IS NULL) AS n_verdict,
  count(e.*) FILTER (WHERE al.symbol IS NULL AND e.chosen_entry_mode='maker') AS maker_verdict,
  count(e.*) FILTER (WHERE al.symbol IS NOT NULL) AS n_alias,
  count(e.*) FILTER (WHERE al.symbol IS NOT NULL AND e.chosen_entry_mode='maker') AS maker_alias
FROM seg
LEFT JOIN switch_on_shadow_evidence e ON e.captured_at >= seg.s AND e.captured_at < seg.e AND e.proof_type='maker_taker' AND e.asset_class='xstock_spot'
LEFT JOIN alias al ON al.symbol = e.symbol
GROUP BY seg.i, seg.sha, seg.s, seg.e ORDER BY seg.i;

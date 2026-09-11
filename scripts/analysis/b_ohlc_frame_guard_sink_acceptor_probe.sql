-- B-OHLC-FRAME-GUARD (#1028) — Step-2 condition C1: IS THE VALIDATOR'S ACCEPTOR INSIDE THE SINK'S?
--
-- READ-ONLY (BEGIN READ ONLY ... ROLLBACK). Run on the staging database:
--   psql "$DATABASE_URL" -X -f scripts/analysis/b_ohlc_frame_guard_sink_acceptor_probe.sql
--
-- WHAT IT ANSWERS: for each candidate string, does Postgres accept it as input for the archive's
-- price column type numeric(20,8), its volume type numeric(28,8), and integer? The JS side of the
-- comparison is `Number(s)` plus the validator's PLAIN_DECIMAL pattern
-- (server/services/passive-archive/ohlc-frame-validator.ts), exercised in
-- server/tests/unit/b-ohlc-frame-guard.test.ts.
--
-- CONTROLS FIRST: 00_ctrl_valid must read t and 00_ctrl_invalid f in every column, or the instrument
-- is not reading what it claims. The DO block cross-checks pg_input_is_valid against REAL casts, so
-- the soft-error function is shown to apply the typmod (1000000000000 must be f for numeric(20,8)).
--
-- RESULT ON PG 17.6, 2026-09-11 (CC-C):
--   * hex / binary / octal (either case, signed hex too) and 1_000: ACCEPTED — never a chunk-drop
--     hazard, and JS reads the same value for the unsigned forms.
--   * '12' + NBSP, BOM + '12', U+3000 + '12': REJECTED, while JS Number() reads 12 ⇒ the real
--     JS-accepts / PG-rejects gap, closed by gating the UNTRIMMED string.
--   * ASCII \t \v \f \r\n padding: accepted by PG (rejected by the validator anyway — stricter is safe).
--   * every PLAIN_DECIMAL string probed is accepted except numeric(20,8) overflow after rounding
--     (999999999999.999999995), which JS parses to 1e12 and the bound rejects.
--   * NaN / nan: ACCEPTED by PG — which is why the validator's finite check exists (aggregatable).
--   * Infinity / -Infinity / inf: REJECTED.

\pset footer off
BEGIN READ ONLY;
SELECT current_setting('server_version') AS pg;

WITH c(label, s) AS (VALUES
  ('00_ctrl_valid','123.45'), ('00_ctrl_invalid','abc'),
  ('hex','0x10'), ('hex_upper','0X10'), ('bin','0b101'), ('bin_upper','0B101'), ('oct','0o17'), ('oct_upper','0O17'),
  ('neg_hex','-0x10'), ('underscore','1_000'),
  ('exp','1e3'), ('exp_plus','1E+03'), ('exp_neg','1e-7'),
  ('trail_dot','5.'), ('lead_dot','.5'), ('plus','+5'), ('minus','-5'), ('neg_zero','-0'),
  ('pad_lead',' 12'), ('pad_trail','12 '), ('ws_tab', E'\t12'), ('ws_vt', chr(11) || '12'), ('ws_ff', chr(12) || '12'),
  ('ws_crlf', '12' || chr(13) || chr(10)), ('ws_nbsp_trail', '12' || chr(160)), ('ws_bom', chr(65279) || '12'),
  ('ws_u3000', chr(12288) || '12'),
  ('nan','NaN'), ('nan_lower','nan'), ('inf','Infinity'), ('neg_inf','-Infinity'), ('inf_short','inf'),
  ('p_under_1e12','999999999999.99999999'), ('p_1e12_plain','1000000000000'), ('p_1e11','1e11'), ('p_1e12','1e12'),
  ('p_round_to_1e12','999999999999.999999995'),
  ('exp_m999','1e-999'), ('exp_m1000','1e-1000'), ('exp_m1001','1e-1001'), ('exp_m20000','1e-20000'),
  ('exp_m100000','1e-100000'), ('exp_p999','1e999'), ('exp_lead_zeros','1e-00000000000000000005'),
  ('exp_plus_lead_zeros','1e+00000000000000000003'), ('zero_mant_exp_m5000','0e-5000'),
  ('mant31_exp_m30', '1' || repeat('0',30) || 'e-30'), ('mant2000_exp_m2000', '1' || repeat('0',2000) || 'e-2000'),
  ('frac30_nines', '.' || repeat('9',30)), ('tiny_round','0.000000005'), ('twelve_int_digits','123456789012.5'),
  ('empty',''), ('space',' '), ('undefined','undefined'), ('null_str','null'),
  ('comma','1,000'), ('arabic_digits', U&'\0661\0662'), ('trailing_junk','12abc'), ('double_minus','--5'),
  ('bare_e','1e'), ('lead_e','e5'), ('dot_only','.'), ('plus_dot','+.5'), ('dot_exp','5.e3'), ('lead_dot_exp','.5e-3'),
  ('leading_zeros','0000123.4'), ('zeros_2000', repeat('0',2000) || '1'),
  ('frac_20000', '0.' || repeat('0',20000) || '1'), ('digits_30', repeat('1',30)),
  ('v_under_1e20','99999999999999999999.99999999'), ('v_1e19','1e19'), ('v_1e20','1e20')
)
SELECT label,
       pg_input_is_valid(s, 'numeric(20,8)') AS n20_8,
       pg_input_is_valid(s, 'numeric(28,8)') AS n28_8,
       pg_input_is_valid(s, 'integer')       AS int4
FROM c ORDER BY label;

DO $$
DECLARE s text; ok boolean;
BEGIN
  FOREACH s IN ARRAY ARRAY['123.45','1000000000000','999999999999.99999999','1e-1001','1e-1000','0x10','NaN','Infinity',' 12','12'||chr(160)] LOOP
    BEGIN
      PERFORM s::numeric(20,8);
      ok := true;
    EXCEPTION WHEN OTHERS THEN ok := false;
    END;
    RAISE NOTICE 'real cast numeric(20,8) [%] -> %', replace(s, chr(160), '<NBSP>'), ok;
  END LOOP;
END $$;

ROLLBACK;

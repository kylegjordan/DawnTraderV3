-- B-ENTRY-CONSUMPTION-FRESHNESS — operator-only rollback; never listed in MANIFEST.txt.
--
-- Deploy the older code first, then run this file. The forward code writes the
-- consumption-age column on admitted immediate entries, while the older code does
-- not read it and is safe with or without the column.

ALTER TABLE closed_trades
  DROP COLUMN IF EXISTS entry_book_consumption_age_ms;

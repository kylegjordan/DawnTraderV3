### Public venue contract check, after Stage A, September 6, 2026

Kraken's current spot-v2 ticker documentation includes a data timestamp and offers `bbo` or `trades` event triggers. This supports checking the subscription mode before equating a quiet ticker with an unchanged order book. It does not prove that DawnTrader received or deployed these fields. [Ticker contract](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker)

The book contract separately specifies snapshot/update timestamps and a top-of-book checksum. These support a richer crypto observation source, but do not supply this export's missing historical frames or establish xStock channel parity. [Book contract](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/book)

This was a current documentation check of schema/fee-group semantics, not a replacement historical data source. All fee **figures** in the calculations remain from the assignment's prescribed transcription and supplied ladder. The read-only source pin and Stage-A records are unchanged.

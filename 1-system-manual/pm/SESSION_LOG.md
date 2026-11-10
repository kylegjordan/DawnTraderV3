# PM session log

> Append-only crew-check record. One UTC row per owner per sweep. A message being queued or accepted is never recorded as receipt.

| checked UTC | PM | owner | batch and step | latest visible activity | classification | next action or wait | sources |
|---|---|---|---|---|---|---|---|

Classifications are `moving`, `waiting on Kyle`, `waiting on reviewer`, `waiting on CI`, `timed observation`, `waiting on owner`, `deploy window`, `stalled`, `drifted`, or `unknown`.

When a nudge is sent, cite its stall id from `STALL_AND_DRIFT_LOG.md` in the sources cell. Do not rewrite earlier rows; add the next observation.

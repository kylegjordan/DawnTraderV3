# DawnTrader database map operations

The checked-in map is a reviewed baseline. The weekly job makes one governed catalog read, scans one immutable repository ref, verifies both sides, and compares only the stable structural and usage projection. It never commits, pushes, deploys, restarts the app, or changes the database.

## Status and receipts

```sh
systemctl status dt-db-map-weekly.timer dt-db-map-stale.timer
sudo -u deploy ls -lt /var/lib/dt-db-map/receipts
sudo -u deploy sed -n '1,240p' /var/lib/dt-db-map/receipts/<receipt>.json
```

Only eight JSON receipts are retained. A lock-held weekly start creates a skipped receipt and does not count as success.

## Manual generation

The weekly entry point is the manual regeneration command too:

```sh
systemctl start dt-db-map-weekly.service
journalctl -u dt-db-map-weekly.service -n 100 --no-pager
```

For a compare-only check of an already generated private candidate:

```sh
sudo -u deploy node /usr/local/lib/dt-db-map/scripts/db-map/verify.mjs \
  --repo /opt/governance-checker/DawnTraderV3 \
  --root /var/lib/dt-db-map/<private-candidate>
```

The checked-in baseline is refreshed only through the normal review workflow: commit source as `R`, generate from immutable `R`, commit only the generated artifact allowlist as child `C`, then run the verifier with `--artifact-ref C`. Never copy a private receipt into the repository as a baseline.

## Pin update

Changing `tbls` is a new reviewed increment. Update the version, named archive size and SHA-256, vendor the matching upstream schema and license, run the offline fixture render and mutation suite, then use the installer. The installer has no update timer and refuses an archive whose byte size or checksum differs.

## Rollback

```sh
sudo comms-infra/staging/install-dt-db-map --uninstall
```

Uninstall disables the two timers and removes installed executables, units and the pinned binary. It deliberately preserves `/var/lib/dt-db-map` receipts for diagnosis and recovery.

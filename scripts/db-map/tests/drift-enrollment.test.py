#!/usr/bin/env python3
import contextlib
import hashlib
import importlib.machinery
import importlib.util
import io
import os
import sys
import tempfile
import types

if os.name == "nt":
    sys.modules.setdefault("grp", types.SimpleNamespace())
    sys.modules.setdefault("pwd", types.SimpleNamespace())
    os.O_NOFOLLOW = 0

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PATH = os.path.join(ROOT, "comms-infra", "staging", "dt-install-drift")
loader = importlib.machinery.SourceFileLoader("db_map_drift", PATH)
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

box = module.BOXES["dawntrader-staging"]
files = {row[0]: row[1] for row in box["files"]}
required = {
    "scripts/db-map/catalog.sql": "/usr/local/lib/dt-db-map/scripts/db-map/catalog.sql",
    "scripts/db-map/config.mjs": "/usr/local/lib/dt-db-map/scripts/db-map/config.mjs",
    "comms-infra/staging/dt-db-map-runner.mjs": "/usr/local/lib/dt-db-map/dt-db-map-runner.mjs",
    "comms-infra/staging/dt-db-map-policy.mjs": "/usr/local/lib/dt-db-map/dt-db-map-policy.mjs",
    "comms-infra/staging/dt-db-map-weekly": "/usr/local/bin/dt-db-map-weekly",
    "comms-infra/staging/dt-db-map-stale": "/usr/local/bin/dt-db-map-stale",
}
assert all(files.get(source) == installed for source, installed in required.items())
assert "dt-db-map-weekly.timer" in box["timers"] and "dt-db-map-stale.timer" in box["timers"]
assert "db_map_binary" in box["checks"]
assert ("/var/lib/dt-db-map", 0o750, "deploy", "deploy") in box["dirs"]
assert ("/var/lib/dt-db-map/receipts", 0o700, "deploy", "deploy") in box["dirs"]
assert ("/var/lib/dt-db-map/installed.sha", 0o644, "root", "root") in box["private"]

with tempfile.TemporaryDirectory(prefix="db-map-drift-") as root:
    binary = os.path.join(root, "usr", "local", "lib", "dt-db-map", "tbls-v1.97.0", "tbls")
    os.makedirs(os.path.dirname(binary))
    open(binary, "wb").write(b"pinned fixture binary")
    os.chmod(binary, 0o755)
    old_root, old_sha, old_owner = module.ROOT, module.DB_MAP_TBLS_SHA256, module.owner_ok
    module.ROOT = root
    module.DB_MAP_TBLS_SHA256 = hashlib.sha256(b"pinned fixture binary").hexdigest()
    module.owner_ok = lambda *args: (True, "")
    try:
        module.PROBLEMS.clear(); module.CLASSES.clear()
        with contextlib.redirect_stdout(io.StringIO()) as output:
            module.check_extra("db_map_binary", box)
        assert not module.PROBLEMS and "pinned tbls v1.97.0 binary" in output.getvalue()
        open(binary, "ab").write(b"mutant")
        module.PROBLEMS.clear(); module.CLASSES.clear()
        with contextlib.redirect_stdout(io.StringIO()) as output:
            module.check_extra("db_map_binary", box)
        assert len(module.PROBLEMS) == 1 and module.PROBLEMS[0].startswith("DRIFT")
    finally:
        module.ROOT, module.DB_MAP_TBLS_SHA256, module.owner_ok = old_root, old_sha, old_owner

print("db-map drift enrollment: PASS; binary mutation RED")

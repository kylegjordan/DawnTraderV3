from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ssh_keyholder import Config, Keyholder, KeyholderError, ServiceEpoch


EXPECTED = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
WRONG = "SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"


class FakeBackend:
    def __init__(self):
        self.luid = "00000000:00000042"
        self.epoch = ServiceEpoch(123, 456)
        self.fingerprints: list[str] = []
        self.registry: dict[str, str] = {}
        self.marker = None
        self.running = False
        self.spawned: list[tuple[Path, list[str]]] = []
        self.create_registry_record = True
        self.drop_identity_on_registry_remove = False
        self.rewrite_registry_after_remove = False

    def current_luid(self): return self.luid
    def service_epoch(self):
        if not self.running: raise KeyholderError("stopped")
        return self.epoch
    def set_service_manual_and_start(self): self.running = True
    def stop_service(self): self.running = False
    def list_fingerprints(self): return list(self.fingerprints)
    def purge_identities(self): self.fingerprints = []
    def add_identity(self, path):
        self.fingerprints = [EXPECTED]
        if self.create_registry_record:
            self.registry = {"k|Software\\OpenSSH\\Agent\\Keys\\record": "present"}
    def registry_snapshot(self): return dict(self.registry)
    def purge_registry(self): self.registry = {}
    def remove_registry_records(self, records):
        for record in records: self.registry.pop(record, None)
        if self.drop_identity_on_registry_remove: self.fingerprints = []
        if self.rewrite_registry_after_remove:
            self.registry = {"k|Software\\OpenSSH\\Agent\\Keys\\rewritten": "present"}
    def read_marker(self):
        if self.marker is None: raise KeyholderError("missing marker")
        return dict(self.marker)
    def write_marker(self, marker): self.marker = dict(marker)
    def remove_marker(self): self.marker = None
    def run_client(self, client, args):
        self.spawned.append((client, list(args)))
        return 0


class KeyholderTests(unittest.TestCase):
    def setUp(self):
        root = Path(tempfile.gettempdir()) / "dt-keyholder-test"
        self.config = Config(
            expected_fingerprint=EXPECTED,
            private_key_path=root / "key",
            marker_path=root / "marker.json",
            registry_path=r"Software\OpenSSH\Agent\Keys",
            clients={
                "ssh": Path(r"C:\Windows\System32\OpenSSH\ssh.exe"),
                "scp": Path(r"C:\Windows\System32\OpenSSH\scp.exe"),
                "sftp": Path(r"C:\Windows\System32\OpenSSH\sftp.exe"),
            },
        )
        self.backend = FakeBackend()
        self.keyholder = Keyholder(self.config, self.backend)

    def unlock(self):
        self.keyholder.unlock()

    def test_unlock_removes_persistence_but_keeps_current_memory_identity(self):
        marker = self.keyholder.unlock()
        self.assertEqual(marker["fingerprint"], EXPECTED)
        self.assertEqual(self.backend.registry, {})
        self.assertEqual(self.backend.fingerprints, [EXPECTED])

    def test_exact_state_launches_only_the_absolute_selected_client(self):
        self.unlock()
        result = self.keyholder.execute("ssh", ["root@example", "true"])
        self.assertEqual(result, 0)
        self.assertEqual(self.backend.spawned, [(
            Path(r"C:\Windows\System32\OpenSSH\ssh.exe"),
            ["root@example", "true"],
        )])

    def test_zero_wrong_and_multiple_identities_refuse_before_client_spawn(self):
        for fingerprints in ([], [WRONG], [EXPECTED, WRONG]):
            with self.subTest(fingerprints=fingerprints):
                self.unlock()
                self.backend.fingerprints = fingerprints
                with self.assertRaises(KeyholderError):
                    self.keyholder.execute("ssh", ["root@example", "true"])
                self.assertEqual(self.backend.spawned, [])

    def test_stale_logon_marker_refuses_expected_key_before_client_spawn(self):
        self.unlock()
        self.backend.luid = "00000000:00000099"
        with self.assertRaises(KeyholderError):
            self.keyholder.execute("ssh", ["root@example", "true"])
        self.assertEqual(self.backend.fingerprints, [EXPECTED])
        self.assertEqual(self.backend.spawned, [])

    def test_restarted_service_refuses_expected_key_before_client_spawn(self):
        self.unlock()
        self.backend.epoch = ServiceEpoch(999, 1000)
        with self.assertRaises(KeyholderError):
            self.keyholder.execute("scp", ["source", "root@example:/tmp/"])
        self.assertEqual(self.backend.spawned, [])

    def test_recreated_registry_record_refuses_before_client_spawn(self):
        self.unlock()
        self.backend.registry = {"k|Software\\OpenSSH\\Agent\\Keys\\record": "present"}
        with self.assertRaises(KeyholderError):
            self.keyholder.execute("sftp", ["root@example"])
        self.assertEqual(self.backend.spawned, [])

    def test_unlock_refuses_when_load_creates_no_attributable_registry_record(self):
        self.backend.create_registry_record = False
        with self.assertRaises(KeyholderError):
            self.keyholder.unlock()
        self.assertFalse(self.backend.running)
        self.assertEqual(self.backend.fingerprints, [])

    def test_unlock_refuses_when_record_removal_also_destroys_memory_identity(self):
        self.backend.drop_identity_on_registry_remove = True
        with self.assertRaises(KeyholderError):
            self.keyholder.unlock()
        self.assertFalse(self.backend.running)

    def test_unlock_refuses_when_agent_rewrites_persistent_material(self):
        self.backend.rewrite_registry_after_remove = True
        with self.assertRaises(KeyholderError):
            self.keyholder.unlock()
        self.assertFalse(self.backend.running)
        self.assertEqual(self.backend.registry, {})

    def test_lock_deletes_marker_identity_registry_and_service(self):
        self.unlock()
        self.keyholder.lock()
        self.assertIsNone(self.backend.marker)
        self.assertEqual(self.backend.fingerprints, [])
        self.assertEqual(self.backend.registry, {})
        self.assertFalse(self.backend.running)


if __name__ == "__main__":
    unittest.main()

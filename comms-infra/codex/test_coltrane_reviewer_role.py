"""Offline role-boundary tests for Coltrane's two invocation paths."""

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_script(name: str, filename: str):
    if filename == "coltrane-bot.py":
        sys.modules.setdefault(
            "discord",
            types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})),
        )
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class ReviewerRoleInstructionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.modules = (
            load_script("coltrane_bot_role_test", "coltrane-bot.py"),
            load_script("coltrane_bridge_role_test", "coltrane-bridge.py"),
        )

    def assert_reviewer(self, module, path):
        text = module.reviewer_role_instruction(path)
        self.assertIn("Crew mode is CODEX", text)
        self.assertIn("replace Langston", text)

    def assert_advisor(self, module, path):
        text = module.reviewer_role_instruction(path)
        self.assertIn("not proven CODEX", text)
        self.assertIn("NOT part of the routine", text)

    def test_exact_and_normalized_codex_enable_shift_reviewer(self):
        for raw_mode in ("codex", " CODEX "):
            with self.subTest(raw_mode=raw_mode), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "state.json"
                path.write_text(json.dumps({"mode": raw_mode}), encoding="utf-8")
                for module in self.modules:
                    self.assert_reviewer(module, path)

    def test_every_non_codex_state_fails_closed(self):
        cases = ({"mode": "claude"}, {"mode": "other"}, {}, {"mode": None})
        for payload in cases:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "state.json"
                path.write_text(json.dumps(payload), encoding="utf-8")
                for module in self.modules:
                    self.assert_advisor(module, path)

    def test_missing_and_malformed_state_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            malformed = Path(tmp) / "malformed.json"
            malformed.write_text("not-json", encoding="utf-8")
            for module in self.modules:
                self.assert_advisor(module, missing)
                self.assert_advisor(module, malformed)


if __name__ == "__main__":
    unittest.main()

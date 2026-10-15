"""Offline role-boundary tests for Coltrane's two invocation paths."""

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


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
        mode, text = module.reviewer_role(path)
        self.assertEqual(mode, "codex")
        self.assertIn("CURRENT CREW MODE: CODEX", text)
        self.assertIn("replace Langston", text)

    def assert_advisor(self, module, path):
        mode, text = module.reviewer_role(path)
        self.assertEqual(mode, "claude")
        self.assertIn("CURRENT CREW MODE: CLAUDE", text)
        self.assertIn("additional advisor", text)

    def assert_unknown(self, module, path):
        mode, text = module.reviewer_role(path)
        self.assertEqual(mode, "unknown")
        self.assertIn("CURRENT CREW MODE: UNKNOWN", text)
        self.assertIn("Refuse routine workflow reviews", text)

    def test_exact_and_normalized_codex_enable_shift_reviewer(self):
        for raw_mode in ("codex", " CODEX "):
            with self.subTest(raw_mode=raw_mode), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "state.json"
                path.write_text(json.dumps({"mode": raw_mode}), encoding="utf-8")
                for module in self.modules:
                    self.assert_reviewer(module, path)

    def test_claude_state_preserves_advisor_role(self):
        cases = ({"mode": "claude"}, {"mode": " CLAUDE "})
        for payload in cases:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "state.json"
                path.write_text(json.dumps(payload), encoding="utf-8")
                for module in self.modules:
                    self.assert_advisor(module, path)

    def test_unsupported_missing_and_malformed_state_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            malformed = Path(tmp) / "malformed.json"
            malformed.write_text("not-json", encoding="utf-8")
            for module in self.modules:
                self.assert_unknown(module, missing)
                self.assert_unknown(module, malformed)
                for payload in ({"mode": "other"}, {}, {"mode": None}):
                    unsupported = Path(tmp) / "unsupported.json"
                    unsupported.write_text(json.dumps(payload), encoding="utf-8")
                    self.assert_unknown(module, unsupported)

    def test_unreadable_state_permission_error_fails_closed(self):
        for module in self.modules:
            with self.subTest(module=module.__name__), mock.patch(
                "builtins.open", side_effect=PermissionError("deterministic unreadable state")
            ):
                self.assert_unknown(module, "unreadable-state.json")

    def test_mode_change_before_publish_discards_generated_role(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            path.write_text(json.dumps({"mode": "codex"}), encoding="utf-8")
            for module in self.modules:
                discarded, response = module.response_after_mode_check(
                    "codex", "generated review", "ANALYST Codex", path
                )
                self.assertFalse(discarded)
                self.assertEqual(response, "generated review")
            path.write_text(json.dumps({"mode": "claude"}), encoding="utf-8")
            for module in self.modules:
                discarded, response = module.response_after_mode_check(
                    "codex", "generated review", "ANALYST Codex", path
                )
                self.assertTrue(discarded)
                self.assertNotIn("generated review", response)
                self.assertIn("changed from CODEX to CLAUDE", response)


if __name__ == "__main__":
    unittest.main()

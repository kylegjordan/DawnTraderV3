import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


class _Client:
    pass


class _DMChannel:
    pass


class _Intents:
    @staticmethod
    def default():
        return types.SimpleNamespace(message_content=False, dm_messages=False)


fake_discord = types.ModuleType("discord")
fake_discord.Client = _Client
fake_discord.DMChannel = _DMChannel
fake_discord.Intents = _Intents
sys.modules.setdefault("discord", fake_discord)

spec = importlib.util.spec_from_file_location(
    "coltrane_bot_under_test", Path(__file__).with_name("coltrane-bot.py")
)
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class ReviewerRolePromptTests(unittest.TestCase):
    def render(self, state):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "state.json"
            path.write_text(json.dumps(state), encoding="utf-8")
            return bot.reviewer_role(str(path))

    def test_codex_mode_assigns_every_routine_review_gate_to_coltrane(self):
        mode, text = self.render({"mode": "codex"})
        self.assertEqual(mode, "codex")
        self.assertIn("CURRENT CREW MODE: CODEX", text)
        for gate in ("scope", "pre-audit", "code-diff", "staging-verification", "completion"):
            self.assertIn(gate, text)
        self.assertIn("Langston is off duty", text)

    def test_claude_mode_keeps_langston_as_routine_reviewer(self):
        mode, text = self.render({"mode": "claude"})
        self.assertEqual(mode, "claude")
        self.assertIn("CURRENT CREW MODE: CLAUDE", text)
        self.assertIn("Langston is the on-duty routine reviewer", text)
        self.assertIn("additional advisor", text)

    def test_missing_malformed_and_unsupported_state_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            missing = bot.reviewer_role(str(Path(td) / "missing.json"))
            malformed_path = Path(td) / "malformed.json"
            malformed_path.write_text("not json", encoding="utf-8")
            malformed = bot.reviewer_role(str(malformed_path))
        unsupported = self.render({"mode": "other"})
        for mode, text in (missing, malformed, unsupported):
            self.assertEqual(mode, "unknown")
            self.assertIn("CURRENT CREW MODE: UNKNOWN", text)
            self.assertIn("Refuse routine workflow reviews", text)

    def test_mode_change_before_publish_discards_the_generated_response(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "state.json"
            path.write_text(json.dumps({"mode": "codex"}), encoding="utf-8")
            changed, mode = bot.reviewer_mode_transition("codex", str(path))
            self.assertFalse(changed)
            self.assertEqual(mode, "codex")
            path.write_text(json.dumps({"mode": "claude"}), encoding="utf-8")
            changed, mode = bot.reviewer_mode_transition("codex", str(path))
            self.assertTrue(changed)
            self.assertEqual(mode, "claude")


if __name__ == "__main__":
    unittest.main()

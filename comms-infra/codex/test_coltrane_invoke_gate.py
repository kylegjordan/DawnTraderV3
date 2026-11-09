"""Offline proof that the crew-switch launch gate blocks Coltrane before Popen."""

import fcntl
import importlib.util
import os
import sys
import tempfile
import threading
import time
import types
import unittest
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve().parent
sys.modules.setdefault("discord", types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})))
spec = importlib.util.spec_from_file_location("coltrane_bot_gate_test", HERE / "coltrane-bot.py")
bot = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(bot)


class FakeProcess:
    pid = 4242
    returncode = 0

    def __init__(self, finish):
        self.finish = finish

    def communicate(self, timeout=None):
        self.finish.wait(timeout=2)
        return "ok", ""


class InvokeGateTests(unittest.TestCase):
    def test_exclusive_off_gate_prevents_popen_until_released(self):
        with tempfile.TemporaryDirectory() as tmp:
            gate_path = os.path.join(tmp, "coltrane-invoke.lock")
            bot.INVOKE_GATE = gate_path
            owner = os.open(gate_path, os.O_CREAT | os.O_RDWR, 0o600)
            fcntl.flock(owner, fcntl.LOCK_EX)
            started = threading.Event()
            finish = threading.Event()
            result = {}

            def fake_popen(*args, **kwargs):
                started.set()
                return FakeProcess(finish)

            def launch():
                result["value"] = bot.run_codex(["true"], None)

            with mock.patch.object(bot.subprocess, "Popen", side_effect=fake_popen):
                thread = threading.Thread(target=launch)
                thread.start()
                time.sleep(0.15)
                self.assertFalse(started.is_set(), "Popen entered while crew-switch owned the exclusive OFF gate")
                fcntl.flock(owner, fcntl.LOCK_UN)
                os.close(owner)
                self.assertTrue(started.wait(timeout=2))

                contender = os.open(gate_path, os.O_RDWR)
                with self.assertRaises(BlockingIOError, msg="active review did not retain the shared invoke gate"):
                    fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
                finish.set()
                thread.join(timeout=3)
                fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
                os.close(contender)

            self.assertFalse(thread.is_alive())
            self.assertEqual((0, "ok"), result["value"][:2])


if __name__ == "__main__":
    unittest.main()

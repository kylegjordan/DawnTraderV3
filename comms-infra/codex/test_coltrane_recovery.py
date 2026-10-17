"""Coltrane's restart recovery (B-LANGSTON-RELIEF OBJ-4, his Step-8 finding 2026-10-17): offline tests of the pure
helpers AND of the real `Coltrane.recover` driven against a fake channel. Run: python3 test_coltrane_recovery.py"""
import asyncio, importlib.util, json, os, sys, tempfile, types, unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.modules.setdefault("discord", types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})))
spec = importlib.util.spec_from_file_location("coltrane_bot_recovery_test", HERE / "coltrane-bot.py")
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class Msg:
    def __init__(self, mid, epoch):
        self.id = mid
        self.created_at = datetime.fromtimestamp(epoch, timezone.utc)


class Chan:
    def __init__(self, msgs):
        self.msgs = msgs

    def history(self, limit=None, oldest_first=None):
        async def gen():
            for m in sorted(self.msgs, key=lambda x: x.id, reverse=True)[:limit]:
                yield m
        return gen()


class Recovery(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        bot.FLOOR = os.path.join(self.d, "floor.json")
        bot.RUNLOG = os.path.join(self.d, "runlog.jsonl")
        self.comms = os.path.join(self.d, "comms.env")
        open(self.comms, "w").write("DISCORD_CHANNEL_ID=42\n")
        bot.COMMS_FILE = self.comms

    def test_pure_rules(self):
        now = 1_000_000.0
        msgs = [(1, now - 90_000), (2, now - 50), (3, now - 40), (4, now - 30)]
        self.assertEqual(bot.recoverable(msgs, None, set(), now), [], "no floor -> nothing replayed, never a guess")
        self.assertEqual(bot.recoverable(msgs, now - 45, set(), now), [3, 4], "only posts after the floor")
        self.assertEqual(bot.recoverable(msgs, now - 100_000, {3}, now), [2, 4], "handled skipped; >24 h not replayed")

    def test_floor_written_once(self):
        self.assertIsNone(bot.read_floor())
        f1 = bot.ensure_floor(100.0)
        f2 = bot.ensure_floor(999.0)
        self.assertEqual((f1, f2), (100.0, 100.0), "the floor is written once and never moved")

    def test_handled_ids_from_runlog(self):
        with open(bot.RUNLOG, "w") as fh:
            fh.write(json.dumps({"message_id": 7}) + "\n" + json.dumps({"event": "bot online"}) + "\nbad\n")
        self.assertEqual(bot.handled_ids(), {7})

    def test_recover_replays_only_unhandled_posts_after_the_floor(self):
        now = datetime.now(timezone.utc).timestamp()
        bot.ensure_floor(now - 600)
        with open(bot.RUNLOG, "w") as fh:
            fh.write(json.dumps({"message_id": 12}) + "\n")
        chan = Chan([Msg(10, now - 900), Msg(11, now - 300), Msg(12, now - 200), Msg(13, now - 100)])
        fed = []

        class C(bot.Coltrane):
            def get_channel(self, cid):
                return chan

            async def on_message(self, m, _recovered=False):
                fed.append((m.id, _recovered))

        c = C.__new__(C)
        asyncio.run(c.recover())
        self.assertEqual(fed, [(11, True), (13, True)], "before-floor (10) and handled (12) are not replayed")
        rows = [json.loads(l) for l in open(bot.RUNLOG)]
        self.assertEqual(rows[-1]["event"], "recovery done")
        self.assertEqual((rows[-1]["scanned"], rows[-1]["replayed"]), (4, 2))

    def test_recover_failure_is_logged_not_silent(self):
        bot.ensure_floor(1.0)

        class C(bot.Coltrane):
            def get_channel(self, cid):
                raise RuntimeError("gateway down")

        c = C.__new__(C)
        asyncio.run(c.recover())
        rows = [json.loads(l) for l in open(bot.RUNLOG)]
        self.assertEqual(rows[-1]["event"], "recovery FAILED")


if __name__ == "__main__":
    unittest.main(verbosity=2)

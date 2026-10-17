"""Coltrane's restart recovery (B-LANGSTON-RELIEF OBJ-4, his Step-8 finding 2026-10-17; Langston r1 2026-10-17):
offline tests of the pure helpers, of the real `Coltrane.recover` against a fake channel, of the real `on_message` gate
on a recovered post, and of the `answered` flag the real `_handle` writes. Run: python3 test_coltrane_recovery.py"""
import asyncio, importlib.util, json, os, sys, tempfile, types, unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.modules.setdefault("discord", types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})))
spec = importlib.util.spec_from_file_location("coltrane_bot_recovery_test", HERE / "coltrane-bot.py")
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class Author:
    def __init__(self, aid, name):
        self.id, self.display_name, self.name = aid, name, name


class Msg:
    def __init__(self, mid, epoch, content="Coltrane, a question", author=None, channel=None):
        self.id = mid
        self.created_at = datetime.fromtimestamp(epoch, timezone.utc)
        self.content = content
        self.author = author or Author(5, "NEW Claude")
        self.channel = channel


class Chan:
    """A channel whose history() honours discord.py 2.7.1's after= / limit= / oldest_first= and records each call."""

    def __init__(self, msgs):
        self.msgs, self.calls, self.sent, self.id = msgs, [], [], 42

    def history(self, limit=100, after=None, oldest_first=None):
        self.calls.append({"limit": limit, "after": after, "oldest_first": oldest_first})

        async def gen():
            ms = [m for m in self.msgs if after is None or m.created_at > after]
            ms.sort(key=lambda x: x.id, reverse=not oldest_first)
            for m in ms[:limit] if limit else ms:
                yield m
        return gen()

    def typing(self):
        class T:
            async def __aenter__(self_):
                return None

            async def __aexit__(self_, *a):
                return False
        return T()

    async def send(self, part):
        self.sent.append(part)


def rows():
    with open(bot.RUNLOG, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def answered_row(mid, answered=True):
    with open(bot.RUNLOG, "a") as fh:
        fh.write(json.dumps({"message_id": mid, "answered": answered}) + "\n")


class Recovery(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        bot.FLOOR = os.path.join(self.d, "floor.json")
        bot.RUNLOG = os.path.join(self.d, "runlog.jsonl")
        self.comms = os.path.join(self.d, "comms.env")
        open(self.comms, "w").write("DISCORD_CHANNEL_ID=42\n")
        bot.COMMS_FILE = self.comms
        bot.Coltrane._inflight = set()
        bot.Coltrane._recovering = False

    def client(self, chan, fed, delay=None):
        class C(bot.Coltrane):
            def get_channel(self, cid):
                return chan

            async def on_message(self, m, _recovered=False):
                fed.append(m.id)
                await asyncio.sleep((delay or {}).get(m.id, 0))
                answered_row(m.id)          # what the real _handle leaves behind once it has posted
        return C.__new__(C)

    def test_pure_rules(self):
        now = 1_000_000.0
        msgs = [(1, now - 90_000), (2, now - 50), (3, now - 40), (4, now - 30)]
        self.assertEqual(bot.recoverable(msgs, None, set(), now), [], "no floor -> nothing replayed, never a guess")
        self.assertEqual(bot.recoverable(msgs, now - 45, set(), now), [3, 4], "only posts after the floor")
        self.assertEqual(bot.recoverable(msgs, now - 100_000, {3}, now), [2, 4], "handled skipped; >24 h not replayed")
        self.assertEqual(bot.window_start(now - 100_000, now), now - 86_400, "the window is capped at 24 h")
        self.assertEqual(bot.window_start(now - 45, now), now - 45, "a newer floor wins")

    def test_floor_written_once(self):
        self.assertIsNone(bot.read_floor())
        f1 = bot.ensure_floor(100.0)
        f2 = bot.ensure_floor(999.0)
        self.assertEqual((f1, f2), (100.0, 100.0), "the floor is written once and never moved")

    def test_handled_ids_counts_only_answered_true(self):
        with open(bot.RUNLOG, "w") as fh:
            for r in ({"message_id": 7, "answered": True}, {"message_id": 8, "answered": False},
                      {"message_id": 9}, {"event": "bot online"}):
                fh.write(json.dumps(r) + "\n")
            fh.write("[1, 2]\n5\nnull\nbad\n")      # valid JSON that is not an object, and junk: never a crash
        self.assertEqual(bot.handled_ids(), {7}, "a failed invoke (8) and a row without the field (9) are retried")

    def test_recover_reads_by_the_clock_not_a_count(self):
        now = datetime.now(timezone.utc).timestamp()
        bot.ensure_floor(now - 600)
        answered_row(12)
        chan = Chan([Msg(10, now - 900), Msg(11, now - 300), Msg(12, now - 200), Msg(13, now - 100)])
        fed = []
        asyncio.run(self.client(chan, fed).recover())
        self.assertEqual(chan.calls[0]["limit"], None, "no message cap")
        self.assertTrue(chan.calls[0]["oldest_first"])
        self.assertAlmostEqual(chan.calls[0]["after"].timestamp(), now - 600, delta=0.01)
        self.assertEqual(fed, [11, 13], "before-floor (10) and answered (12) are not fed; oldest first")
        self.assertEqual((rows()[-1]["event"], rows()[-1]["scanned"], rows()[-1]["fed"]), ("recovery done", 3, 2))

    def test_concurrent_pass_skips_and_never_duplicates(self):
        """Langston r1's exercised blocker: a second on_ready while the first pass is still inside its loop."""
        now = datetime.now(timezone.utc).timestamp()
        bot.ensure_floor(now - 600)
        chan = Chan([Msg(11, now - 300), Msg(12, now - 200), Msg(13, now - 100)])
        fed = []
        c = self.client(chan, fed, delay={11: 0.05, 12: 0.0, 13: 0.0})

        async def two_readies():
            await asyncio.gather(c.recover(), c.recover())
        asyncio.run(two_readies())
        self.assertEqual(fed, [11, 12, 13], "each post fed exactly once")
        self.assertTrue(any(r.get("reason") == "a pass is already running" for r in rows()), "the skip is logged")
        self.assertFalse(c._recovering, "the guard is released")

    def test_feed_time_recheck_skips_a_post_answered_mid_pass(self):
        """The leg the in-memory guard cannot cover: another process answers a post after this pass's snapshot."""
        now = datetime.now(timezone.utc).timestamp()
        bot.ensure_floor(now - 600)
        chan = Chan([Msg(11, now - 300), Msg(12, now - 200)])
        fed = []

        class C(bot.Coltrane):
            def get_channel(self, cid):
                return chan

            async def on_message(self, m, _recovered=False):
                fed.append(m.id)
                answered_row(m.id)
                answered_row(12)            # someone else answered 12 while 11 was being handled
        asyncio.run(C.__new__(C).recover())
        self.assertEqual(fed, [11])

    def test_one_bad_post_does_not_abort_the_queue(self):
        now = datetime.now(timezone.utc).timestamp()
        bot.ensure_floor(now - 600)
        chan = Chan([Msg(11, now - 300), Msg(12, now - 200), Msg(13, now - 100)])
        fed = []

        class C(bot.Coltrane):
            def get_channel(self, cid):
                return chan

            async def on_message(self, m, _recovered=False):
                if m.id == 12:
                    raise ValueError("bad post")
                fed.append(m.id)
        asyncio.run(C.__new__(C).recover())
        self.assertEqual(fed, [11, 13])
        bad = [r for r in rows() if r.get("event") == "recovery feed FAILED"]
        self.assertEqual([r["message_id"] for r in bad], [12])
        self.assertEqual((rows()[-1]["event"], rows()[-1]["fed"], rows()[-1]["failed"]), ("recovery done", 2, 1))

    def test_a_failure_anywhere_in_the_body_is_logged_and_releases_the_guard(self):
        bot.ensure_floor(1.0)
        for where in ("get_channel", "history"):
            class C(bot.Coltrane):
                def get_channel(self, cid):
                    if where == "get_channel":
                        raise RuntimeError("gateway down")

                    class Bad:
                        def history(self, **_k):
                            raise RuntimeError("history down")
                    return Bad()
            c = C.__new__(C)
            asyncio.run(c.recover())
            self.assertEqual(rows()[-1]["event"], "recovery FAILED", where)
            self.assertFalse(c._recovering, where)

    def test_real_gate_drops_a_recovered_post_that_does_not_address_coltrane(self):
        """Langston r1 record (ii): the REAL on_message with only _handle stubbed and self.user set."""
        handled = []

        class C(bot.Coltrane):
            async def _handle(self, m, text, who, is_dm, why, _recovered):
                handled.append((m.id, _recovered, why))
        c = C.__new__(C)
        c.user = Author(999, "Coltrane")
        chan = Chan([])
        for m in (Msg(1, 0, "Langston, please review X", channel=chan),
                  Msg(2, 0, "Coltrane, please look at Y", channel=chan),
                  Msg(3, 0, "Coltrane, my own post", author=Author(999, "Coltrane"), channel=chan),
                  Msg(4, 0, "Coltrane deploy done", author=Author(6, "Push notice"), channel=chan)):
            asyncio.run(c.on_message(m, _recovered=True))
        self.assertEqual([(h[0], h[1]) for h in handled], [(2, True)],
                         "only the post that names Coltrane at the start passes; self and muted senders never do")

    def test_handle_writes_answered_only_when_posted_or_silent(self):
        """The flag recovery keys on, written by the REAL _handle with invoke stubbed."""
        bot.reviewer_role = lambda *a, **k: ("id", "role")
        bot.response_after_mode_check = lambda ident, out, who, *a, **k: (False, out)
        bot.mirror_to_inbox = lambda *a, **k: "ok"
        c = bot.Coltrane.__new__(bot.Coltrane)
        for mid, result, want in ((1, (0, "an answer", ""), True), (2, (0, "SILENT", ""), True),
                                  (3, (1, "", "boom"), False), (4, (0, "", ""), False),
                                  (6, (1, "SILENT", "boom"), False), (7, (2, "SILENT\n", ""), False)):
            bot.invoke = lambda *a, _r=result: _r
            chan = Chan([])
            asyncio.run(c._handle(Msg(mid, 0, channel=chan), "q", "NEW Claude", True, "dm", True))
            self.assertIs(rows()[-1]["answered"], want, mid)
            self.assertEqual(rows()[-1]["message_id"], mid)

        class FailingChan(Chan):
            async def send(self, part):
                raise RuntimeError("send failed")
        bot.invoke = lambda *a: (0, "an answer", "")
        asyncio.run(c._handle(Msg(5, 0, channel=FailingChan([])), "q", "NEW Claude", True, "dm", True))
        self.assertIs(rows()[-1]["answered"], False, "a failed send is not an answer")


if __name__ == "__main__":
    unittest.main(verbosity=2)

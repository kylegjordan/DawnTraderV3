"""B-AGENT-INVOKE-FAILURE-NOTICE, Coltrane's half (P4b, P6, P7, P11, C-7): offline tests of the REAL `_handle`, `recover`,
`on_message`, `handled_ids` and `attempt_counts` with `invoke` stubbed and a fake channel - no codex, no Discord, every
file in a temp dir. Run anywhere: python3 test_coltrane_failure_notice.py   (exit 0 = all pass)
The real-process clean stop (P8, C-6) is a separate hand-run gate on Helsinki: test_coltrane_clean_stop.py."""
import asyncio, importlib.util, json, os, sys, tempfile, types, unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.modules.setdefault("discord", types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})))
os.environ.setdefault("COLTRANE_ADDRESS_LIST", str(HERE.parent / "discord" / "address_list.py"))
spec = importlib.util.spec_from_file_location("coltrane_bot_fn_test", HERE / "coltrane-bot.py")
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)
MARK = bot.FAILURE_NOTICE_MARKER


class Author:
    def __init__(self, aid, name):
        self.id, self.display_name, self.name = aid, name, name


class Chan:
    def __init__(self, msgs=(), fail_send=False, fail_on_send=None):
        self.msgs, self.sent, self.id, self.fail_send = list(msgs), [], 42, fail_send
        self.fail_on_send, self.send_calls = fail_on_send, 0

    def history(self, limit=100, after=None, oldest_first=None):
        async def gen():
            ms = [m for m in self.msgs if after is None or m.created_at > after]
            ms.sort(key=lambda x: x.id, reverse=not oldest_first)
            for m in ms:
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
        self.send_calls += 1
        if self.fail_send or self.send_calls == self.fail_on_send:
            raise RuntimeError("send failed")
        self.sent.append(part)


class Msg:
    def __init__(self, mid, epoch=0, content="Coltrane, a question", author=None, channel=None):
        self.id, self.content, self.channel = mid, content, channel
        self.created_at = datetime.fromtimestamp(epoch, timezone.utc)
        self.author = author or Author(5, "NEW Claude")


def rows():
    with open(bot.RUNLOG, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


class FailureNotice(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        bot.FLOOR = os.path.join(self.d, "floor.json")
        bot.RUNLOG = os.path.join(self.d, "runlog.jsonl")
        self.comms = os.path.join(self.d, "comms.env")
        open(self.comms, "w").write("DISCORD_CHANNEL_ID=42\n")
        bot.COMMS_FILE = self.comms
        bot.Coltrane._inflight = set()
        bot.Coltrane._recovering = False
        bot.reviewer_role = lambda *a, **k: ("id", "role")
        bot.response_after_mode_check = lambda ident, out, who, *a, **k: (False, out)
        self.mirrored = []
        bot.mirror_to_inbox = lambda text, ch, dm: self.mirrored.append(text) or "mirrored"
        self.c = bot.Coltrane.__new__(bot.Coltrane)

    def handle(self, result=None, raises=None, chan=None, mid=1):
        def fake(*a):
            if raises:
                raise raises
            return result
        bot.invoke = fake
        chan = chan or Chan()
        asyncio.run(self.c._handle(Msg(mid, channel=chan), "q", "NEW Claude", False, "named", False))
        return chan, rows()[-1]

    # ── P6 + P7: one row per outcome, and the notice ───────────────────────────────────────────────────────────────
    def test_timeout_writes_its_row_and_tells_the_requester(self):
        chan, r = self.handle((124, "", "codex: deadline exceeded\n", {"outcome": "timeout", "killed_tagged": [],
                                                                       "escaped_untagged": False}))
        self.assertEqual((r["outcome"], r["answered"], r["notified"]), ("timeout", False, True))
        self.assertIn("deadline exceeded", r["error_tail"])
        self.assertEqual(len(chan.sent), 1)
        line = chan.sent[0]
        self.assertTrue(line.startswith("NEW Claude — " + MARK), line)
        self.assertIn("nothing was reviewed", line)
        self.assertIn("15-minute limit", line)
        self.assertLess(len(line), 300)
        self.assertEqual(self.mirrored, [line], "the notice is mirrored like a reply, so the requester's session wakes")

    def test_an_invoke_that_RAISES_still_writes_its_row(self):
        try:
            chan, r = self.handle(raises=RuntimeError("sudo exploded"))
        except RuntimeError:
            self.fail("the invoke's exception escaped _handle - no row was written (the pre-P6 shape)")
        self.assertEqual((r["outcome"], r["notified"], r["message_id"]), ("error", True, 1))
        self.assertIn("sudo exploded", r["error_tail"])

    def test_a_notice_that_fails_to_post_is_not_notified(self):
        chan, r = self.handle((1, "", "boom", {}), chan=Chan(fail_send=True))
        self.assertEqual((r["outcome"], r["notified"]), ("failed", False), "Langston note 2: notified only when POSTED")

    def test_a_PARTIAL_reply_warns_that_earlier_chunks_are_incomplete(self):
        reply = ("A" * 1800) + "\n" + ("B" * 200)
        chan, r = self.handle((0, reply, "", {}), chan=Chan(fail_on_send=2))
        self.assertEqual((r["outcome"], r["answered"], r["notified"]), ("send_failed", False, True))
        self.assertEqual((r["posted_parts"], r["reply_parts"]), (1, 2))
        self.assertEqual(len(chan.sent), 2, "the first reply part and the later failure notice both posted")
        notice = chan.sent[-1]
        self.assertIn("could not be posted in full", notice)
        self.assertIn("treat anything above as incomplete", notice)
        self.assertNotIn("nothing was reviewed", notice)
        self.assertEqual(self.mirrored, [notice])

    def test_a_reply_has_no_notice_and_no_error_tail(self):
        chan, r = self.handle((0, "an answer", "tokens used: 12", {}))
        self.assertEqual((r["outcome"], r["answered"], r["notified"], r["error_tail"]), ("reply", True, False, None))
        self.assertEqual(chan.sent, ["an answer"])

    def test_a_mirror_failure_does_not_rewrite_a_fully_posted_reply_as_partial(self):
        bot.mirror_to_inbox = lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("mirror failed"))
        chan, r = self.handle((0, "a complete answer", "", {}))
        self.assertEqual((r["outcome"], r["answered"], r["notified"]), ("reply", True, False))
        self.assertEqual(chan.sent, ["a complete answer"])
        self.assertIn("MIRROR FAILED", r["mirrored"])

    def test_silent_and_empty(self):
        _, r = self.handle((0, "SILENT", "", {}))
        self.assertEqual((r["outcome"], r["notified"]), ("silent", False))
        chan, r = self.handle((0, "", "", {}), mid=2)
        self.assertEqual((r["outcome"], r["notified"]), ("empty", True), "an empty reply is a no-reply outcome")

    def test_an_untagged_escape_pages_kyle_and_is_recorded(self):
        bot.KYLE_ID = "4242"
        chan, r = self.handle((124, "", "", {"outcome": "timeout", "killed_tagged": [7], "escaped_untagged": True}))
        self.assertTrue(r["escaped_untagged"])
        self.assertEqual(r["killed_tagged"], [7])
        self.assertTrue(any(s.startswith("<@4242> Coltrane:") for s in chan.sent), chan.sent)

    # ── P4b + C-7: the readers, through the rotated set ────────────────────────────────────────────────────────────
    def test_handled_counts_notified_and_attempts_count_every_attempt_row(self):
        with open(bot.RUNLOG, "w") as fh:
            for row in ({"message_id": 1, "rc": 0, "answered": True},
                        {"message_id": 2, "rc": 1, "answered": False, "outcome": "failed", "notified": True},
                        {"message_id": 3, "rc": 1, "answered": False, "outcome": "failed", "notified": False},
                        {"message_id": 3, "event": "recovery feed FAILED", "outcome": "recovery_feed_failed"},
                        {"message_id": 4, "event": "recovery capped", "notified": True},
                        {"event": "bot online"}):
                fh.write(json.dumps(row) + "\n")
        self.assertEqual(bot.handled_ids(), {1, 2, 4})
        self.assertEqual(bot.attempt_counts(), {1: 1, 2: 1, 3: 2}, "a capped row is not an attempt")

    def test_C7_a_rotation_inside_the_window_hides_neither_the_answered_set_nor_the_count(self):
        with open(bot.RUNLOG + ".1", "w") as fh:
            fh.write(json.dumps({"message_id": 9, "rc": 1, "answered": False, "outcome": "failed"}) + "\n")
            fh.write(json.dumps({"message_id": 8, "rc": 0, "answered": True}) + "\n")
        with open(bot.RUNLOG, "w") as fh:
            fh.write(json.dumps({"message_id": 9, "event": "recovery feed FAILED", "outcome": "recovery_feed_failed"}) + "\n")
        self.assertIn(8, bot.handled_ids(), "an answer written before the rotation still counts")
        self.assertEqual(bot.attempt_counts().get(9), 2, "the attempt count survives the rotation")

    # ── P4b: the cap, in the REAL recover() ────────────────────────────────────────────────────────────────────────
    def test_recover_caps_at_two_attempts_and_tells_the_requester_once(self):
        now = datetime.now(timezone.utc).timestamp()
        with open(bot.FLOOR, "w") as fh:
            json.dump({"since_epoch": now - 3600}, fh)
        chan = Chan()
        capped = Msg(21, now - 600, "Coltrane, review A", channel=chan)
        fresh = Msg(22, now - 500, "Coltrane, review B", channel=chan)
        chan.msgs = [capped, fresh]
        with open(bot.RUNLOG, "w") as fh:
            fh.write(json.dumps({"message_id": 21, "rc": 124, "answered": False, "outcome": "timeout", "notified": False}) + "\n")
            fh.write(json.dumps({"message_id": 21, "event": "recovery feed FAILED", "outcome": "recovery_feed_failed"}) + "\n")
        fed = []

        class C(bot.Coltrane):
            def get_channel(self_, cid):
                return chan

            async def on_message(self_, m, _recovered=False):
                fed.append(m.id)
        c = C.__new__(C)
        asyncio.run(c.recover())
        self.assertEqual(fed, [22], "the capped post is not re-fed; the fresh one is")
        cap_rows = [r for r in rows() if r.get("event") == "recovery capped"]
        self.assertEqual([(r["message_id"], r["notified"]) for r in cap_rows], [(21, True)])
        self.assertEqual(len([s for s in chan.sent if MARK in s]), 1, "ONE notice at the cap")
        self.assertIn("failed on every retry", chan.sent[0])
        asyncio.run(c.recover())
        self.assertEqual(len([s for s in chan.sent if MARK in s]), 1, "a second pass does not notify again")

    # ── P11: Langston's failure notice is not a request ────────────────────────────────────────────────────────────
    def test_P11_langstons_notice_does_not_engage_coltrane(self):
        bot.LANGSTON_BOT_ID = "9"
        handled = []

        class C(bot.Coltrane):
            async def _handle(self_, m, text, who, is_dm, why, _recovered):
                handled.append(m.id)
        c = C.__new__(C)
        c.user = Author(999, "Coltrane")
        lang = Author(9, "Langston")
        chan = Chan()
        asyncio.run(c.on_message(Msg(31, 0, "Coltrane — " + MARK + " your request to Langston failed; nothing was reviewed.",
                                     author=lang, channel=chan)))
        asyncio.run(c.on_message(Msg(32, 0, "Coltrane — please look at the plan", author=lang, channel=chan)))
        self.assertEqual(handled, [32], "the notice is ignored; the same author without the marker still engages")
        self.assertFalse(bot.is_langston_failure_notice(5, "Coltrane — " + MARK), "a person quoting the marker engages")
        bot.LANGSTON_BOT_ID = ""
        self.assertFalse(bot.is_langston_failure_notice(9, "Coltrane — " + MARK), "no id on file -> inert")


if __name__ == "__main__":
    unittest.main(verbosity=1)

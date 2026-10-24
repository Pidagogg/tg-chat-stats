// Stats engine + Desktop export parser. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStats, compareChats, countWord, streaks, REPLY_WINDOW } from "../src/stats/engine.ts";
import { parseExport, exportText } from "../src/sources/desktopExport.ts";
import type { ChatData, Msg } from "../src/stats/types.ts";

// local-time timestamp helper (the engine buckets by local time)
const at = (y: number, mo: number, d: number, h: number, mi = 0) => Math.floor(new Date(y, mo - 1, d, h, mi).getTime() / 1000);
let nextId = 1;
const msg = (from: string, date: number, extra: Partial<Msg> = {}): Msg => ({ id: nextId++, date, from, fromName: from === "u1" ? "Ann" : "Bob", kind: "text", text: "", ...extra });

test("counts per sender, kinds, words and emojis", () => {
  const chat: ChatData = {
    id: "c",
    title: "Ann & Bob",
    type: "private",
    messages: [
      msg("u1", at(2026, 3, 2, 9), { text: "Good morning Bob 😀😀" }),
      msg("u2", at(2026, 3, 2, 9, 5), { text: "morning! coffee?" }),
      msg("u1", at(2026, 3, 2, 9, 6), { kind: "voice", duration: 12 }),
      msg("u2", at(2026, 3, 2, 21), { kind: "sticker" }),
      msg("u1", at(2026, 3, 3, 8), { text: "coffee coffee and more coffee ❤️" }),
    ],
  };
  const s = computeStats(chat, { today: "2026-03-03" });
  assert.equal(s.total, 5);
  assert.equal(s.senders[0].name, "Ann");
  assert.equal(s.senders[0].messages, 3);
  assert.equal(s.senders[0].voiceSeconds, 12);
  assert.equal(s.kinds.text, 3);
  assert.equal(s.kinds.sticker, 1);
  assert.equal(s.topWords[0].word, "coffee");
  assert.equal(s.topWords[0].count, 4);
  assert.ok(!s.topWords.some((w) => w.word === "and"), "stopwords are skipped");
  assert.deepEqual(s.topEmojis[0], { emoji: "😀", count: 2 });
  assert.ok(s.topEmojis.some((e) => e.emoji === "❤️"));
  assert.equal(s.heatmap[0][9], 3, "Monday 9:00 bucket");
  assert.equal(s.byMonth[0].month, "2026-03");
  assert.equal(s.activeDays, 2);
  assert.deepEqual(s.streak, { longest: 2, longestFrom: "2026-03-02", current: 2 });
  assert.equal(s.busiestDay?.day, "2026-03-02");
});

test("reply times use medians and ignore long pauses; starts are counted", () => {
  const t0 = at(2026, 5, 1, 10);
  const chat: ChatData = {
    id: "c",
    title: "x",
    type: "private",
    messages: [
      msg("u1", t0),
      msg("u2", t0 + 60), // Bob replies after 1 min
      msg("u1", t0 + 120), // Ann after 1 min
      msg("u2", t0 + 120 + 600), // Bob after 10 min
      msg("u2", t0 + 120 + 600 + REPLY_WINDOW + 1), // new conversation, not a reply
      msg("u1", t0 + 120 + 600 + REPLY_WINDOW + 31), // Ann after 30 s
    ],
  };
  const s = computeStats(chat);
  const bob = s.senders.find((x) => x.id === "u2")!;
  const ann = s.senders.find((x) => x.id === "u1")!;
  assert.equal(bob.medianReplySeconds, 330, "median of 60 and 600");
  assert.equal(bob.starts, 1);
  assert.equal(ann.starts, 1, "Ann opened the first conversation");
  assert.equal(ann.medianReplySeconds, 45, "median of 60 and 30");
});

test("group reply pairs and reactions", () => {
  const t = at(2026, 6, 1, 12);
  const a = msg("u1", t, { text: "plan?" });
  const chat: ChatData = {
    id: "g",
    title: "Group",
    type: "group",
    messages: [a, msg("u2", t + 5, { replyTo: a.id, reactions: 3, text: "yes!" }), msg("u3", t + 9, { replyTo: a.id }), msg("u2", t + 12, { replyTo: a.id })],
  };
  const s = computeStats(chat);
  assert.deepEqual(s.replyPairs[0], { from: "Bob", to: "Ann", count: 2 });
  assert.equal(s.mostReacted[0].reactions, 3);
});

test("streaks", () => {
  assert.deepEqual(streaks(["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05", "2026-01-06"], "2026-01-10"), {
    longest: 3,
    longestFrom: "2026-01-04",
    current: 0,
  });
  assert.equal(streaks(["2026-01-09", "2026-01-10"], "2026-01-10").current, 2);
  assert.equal(streaks([], "2026-01-10").longest, 0);
});

test("compare ranks chats and shows my share", () => {
  const t = at(2026, 1, 5, 10);
  const mk = (id: string, n: number): ChatData => ({
    id,
    title: id,
    type: "private",
    me: "u1",
    messages: Array.from({ length: n }, (_, i) => msg(i % 2 ? "u2" : "u1", t + i * 60)),
  });
  const rows = compareChats([computeStats(mk("small", 4)), computeStats(mk("big", 10))], "u1");
  assert.deepEqual(rows.map((r) => r.title), ["big", "small"]);
  assert.equal(rows[0].myShare, 50);
  assert.equal(rows[0].theirMedianReply, 60);
});

test("the Desktop export parser handles single chats and full exports", () => {
  assert.equal(exportText(["Hi ", { type: "bold", text: "there" }, "!"]), "Hi there!");
  const single = parseExport({
    name: "Bob",
    type: "personal_chat",
    id: 42,
    messages: [
      { id: 1, type: "message", date: "2026-02-01T10:00:00", date_unixtime: "1769940000", from: "Ann", from_id: "user1", text: "hello" },
      { id: 2, type: "service", date_unixtime: "1769940010", actor: "Ann", action: "pin_message" },
      { id: 3, type: "message", date_unixtime: "1769940020", from: "Bob", from_id: "user2", media_type: "voice_message", duration_seconds: 7, text: "", reply_to_message_id: 1 },
      { id: 4, type: "message", date_unixtime: "1769940030", from: "Bob", from_id: "user2", photo: "photos/1.jpg", text: "", reactions: [{ type: "emoji", count: 2 }] },
    ],
  });
  assert.equal(single.length, 1);
  assert.equal(single[0].type, "private");
  assert.equal(single[0].messages.length, 3, "service messages are skipped");
  assert.deepEqual(single[0].messages.map((m) => m.kind), ["text", "voice", "photo"]);
  assert.equal(single[0].messages[1].replyTo, 1);
  assert.equal(single[0].messages[2].reactions, 2);

  const full = parseExport({
    personal_information: { user_id: 1, first_name: "Ann" },
    chats: { list: [{ name: "G", type: "private_supergroup", id: 7, messages: [] }, { name: "C", type: "public_channel", id: 8, messages: [] }] },
  });
  assert.deepEqual(full.map((c) => [c.type, c.me]), [["group", "user1"], ["channel", "user1"]]);
  assert.throws(() => parseExport({ foo: 1 }), /No chats found/);
});

test("word search counts each person's uses, whole words, any case, ё = е", () => {
  const chat: ChatData = {
    id: "w",
    title: "Words",
    type: "group",
    messages: [
      msg("u1", at(2026, 3, 2, 9), { text: "Coffee? COFFEE! coffee-time" }),
      msg("u2", at(2026, 3, 2, 10), { text: "no coffees, decaf coffee only" }),
      msg("u2", at(2026, 3, 2, 11), { text: "Ёлка и елка" }),
      msg("u3", at(2026, 3, 2, 12), { text: "nothing here", fromName: "Cid" }),
      msg("u1", at(2026, 3, 2, 13), { kind: "voice" }),
    ],
  };
  const exact = countWord(chat, "coffee");
  assert.equal(exact.total, 4);
  assert.deepEqual(exact.senders.map((s) => [s.name, s.count, s.messages]), [["Ann", 3, 1], ["Bob", 1, 1], ["Cid", 0, 0]]);
  const forms = countWord(chat, "Coffee", { forms: true });
  assert.equal(forms.senders.find((s) => s.name === "Bob")!.count, 2);
  assert.equal(countWord(chat, "елка").total, 2);
  assert.equal(countWord(chat, "decaf coffee").total, 1);
  assert.equal(countWord(chat, "  ").total, 0);
  assert.equal(countWord(chat, "c+").total, 0);
});

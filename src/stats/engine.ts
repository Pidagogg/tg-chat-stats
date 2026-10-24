// Pure statistics over a chat's messages. No I/O, no DOM — it runs in a Web
// Worker on the user's device and is unit-tested with node --test.
//
// Definitions, kept simple and honest:
// - A "reply" is the next message after someone else's message, within
//   REPLY_WINDOW. Longer pauses count as a new conversation, not a slow reply,
//   so one night's sleep doesn't wreck the numbers. Medians, not means.
// - A "conversation start" is the first message after a pause of REPLY_WINDOW.
// - Days, hours and weekdays use the device's local time zone.
// - Streaks count calendar days with at least one message.
import type { ChatData, Msg, MsgKind, SenderStats, Stats } from "./types.ts";

export const REPLY_WINDOW = 6 * 3600;

const STOPWORDS = new Set(
  (
    // en
    "the a an and or but if of to in on at for with from by is are was were be been it its this that these those i you he she we they me him her us them my your his our their not no yes so do does did have has had will would can could just what when where who why how there here then than too very all any some more most also only about into out up down over again ok okay im dont thats its yeah lol " +
    // ru
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это" +
    " " +
    // de
    "der die das und oder aber wenn von zu im in auf an für mit aus bei ist sind war waren sein es dies diese ich du er sie wir ihr mich dich ihn uns euch mein dein sein unser nicht nein ja so tun hat haben hatte wird würde kann könnte nur was wann wo wer warum wie da dann als auch noch schon mal ein eine einen einem einer den dem des"
  ).split(/\s+/)
);

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
const WORD = /[\p{L}][\p{L}\p{N}'’-]{2,}/gu;

function dayKey(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const bump = <K extends string>(map: Partial<Record<K, number>>, key: K, by = 1) => {
  map[key] = (map[key] || 0) + by;
};

function countTop(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/** Calendar-day streaks: longest run, its first day, and the run ending today/yesterday. */
export function streaks(days: string[], today = dayKey(Date.now() / 1000)) {
  const set = [...new Set(days)].sort();
  let longest = 0;
  let longestFrom: string | null = null;
  let run = 0;
  let runFrom = "";
  let prev: number | null = null;
  const dayNum = (k: string) => Math.round(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000);
  for (const k of set) {
    const n = dayNum(k);
    if (prev !== null && n === prev + 1) run++;
    else {
      run = 1;
      runFrom = k;
    }
    if (run > longest) {
      longest = run;
      longestFrom = runFrom;
    }
    prev = n;
  }
  const last = set.at(-1);
  const gap = last ? dayNum(today) - dayNum(last) : Infinity;
  return { longest, longestFrom, current: gap <= 1 ? run : 0 };
}

export function computeStats(chat: ChatData, opts: { today?: string } = {}): Stats {
  const msgs = chat.messages.filter((m) => m && Number.isFinite(m.date)).sort((a, b) => a.date - b.date || a.id - b.id);
  const byId = new Map<number, Msg>();
  for (const m of msgs) byId.set(m.id, m);

  const senders = new Map<string, SenderStats & { _replyTimes: number[] }>();
  const sender = (m: Msg) => {
    let s = senders.get(m.from);
    if (!s) {
      s = { id: m.from, name: m.fromName || m.from, messages: 0, words: 0, chars: 0, kinds: {}, voiceSeconds: 0, medianReplySeconds: null, replies: 0, starts: 0, longestMessage: 0, reactionsReceived: 0, _replyTimes: [] };
      senders.set(m.from, s);
    }
    if (m.fromName && s.name === s.id) s.name = m.fromName;
    return s;
  };

  const kinds: Partial<Record<MsgKind, number>> = {};
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const byMonth = new Map<string, number>();
  const byDay = new Map<string, number>();
  const words = new Map<string, number>();
  const emojis = new Map<string, number>();
  const pairs = new Map<string, number>();
  const reacted: Stats["mostReacted"] = [];

  let prev: Msg | null = null;
  for (const m of msgs) {
    const s = sender(m);
    s.messages++;
    bump(s.kinds, m.kind);
    bump(kinds, m.kind);
    if (m.kind === "voice" || m.kind === "video_note") s.voiceSeconds += m.duration || 0;
    const text = m.text || "";
    s.chars += text.length;
    s.longestMessage = Math.max(s.longestMessage, text.length);
    for (const w of text.toLowerCase().match(WORD) || []) {
      s.words++;
      const clean = w.replace(/['’-]+$/, "");
      if (!STOPWORDS.has(clean) && !/^\d+$/.test(clean)) words.set(clean, (words.get(clean) || 0) + 1);
    }
    for (const e of text.match(EMOJI) || []) emojis.set(e, (emojis.get(e) || 0) + 1);
    if (m.reactions) {
      s.reactionsReceived += m.reactions;
      reacted.push({ id: m.id, from: s.name, reactions: m.reactions, preview: text.slice(0, 80) });
    }

    const d = new Date(m.date * 1000);
    const wd = (d.getDay() + 6) % 7;
    heatmap[wd][d.getHours()]++;
    byHour[d.getHours()]++;
    byWeekday[wd]++;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
    const day = dayKey(m.date);
    byDay.set(day, (byDay.get(day) || 0) + 1);

    const gap = prev ? m.date - prev.date : Infinity;
    if (gap > REPLY_WINDOW) s.starts++;
    else if (prev && prev.from !== m.from) {
      s._replyTimes.push(gap);
      s.replies++;
    }
    // explicit replies (groups): who answers whom
    const target = m.replyTo !== undefined ? byId.get(m.replyTo) : undefined;
    if (target && target.from !== m.from) {
      const key = `${m.from}\u0000${target.from}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    prev = m;
  }

  const list = [...senders.values()]
    .map(({ _replyTimes, ...s }) => ({ ...s, medianReplySeconds: median(_replyTimes) }))
    .sort((a, b) => b.messages - a.messages);
  const nameOf = (id: string) => senders.get(id)?.name || id;
  const busiest = countTop(byDay, 1)[0];
  const first = msgs[0]?.date ?? null;
  const last = msgs.at(-1)?.date ?? null;
  const spanDays = first !== null && last !== null ? Math.max(1, Math.ceil((last - first) / 86400)) : 0;

  return {
    chat: { id: chat.id, title: chat.title, type: chat.type },
    total: msgs.length,
    first,
    last,
    activeDays: byDay.size,
    perDay: spanDays ? Math.round((msgs.length / spanDays) * 10) / 10 : 0,
    senders: list,
    kinds,
    heatmap,
    byHour,
    byWeekday,
    byMonth: [...byMonth.entries()].sort().map(([month, count]) => ({ month, count })),
    streak: streaks([...byDay.keys()], opts.today),
    busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
    topWords: countTop(words, 30).map(([word, count]) => ({ word, count })),
    topEmojis: countTop(emojis, 20).map(([emoji, count]) => ({ emoji, count })),
    replyPairs: countTop(pairs, 10).map(([k, count]) => {
      const [from, to] = k.split("\u0000");
      return { from: nameOf(from), to: nameOf(to), count };
    }),
    mostReacted: reacted.sort((a, b) => b.reactions - a.reactions).slice(0, 5),
  };
}

export interface CompareRow {
  id: string;
  title: string;
  type: Stats["chat"]["type"];
  total: number;
  perDay: number;
  myShare: number | null;
  myMedianReply: number | null;
  theirMedianReply: number | null;
  last: number | null;
  longestStreak: number;
}

/** Several chats side by side — "who do I text most". */
export function compareChats(all: Stats[], me?: string): CompareRow[] {
  return all
    .map((s) => {
      const mine = me ? s.senders.find((x) => x.id === me) : undefined;
      const others = s.senders.filter((x) => x.id !== me);
      const theirs = others.map((x) => x.medianReplySeconds).filter((v): v is number => v !== null);
      return {
        id: s.chat.id,
        title: s.chat.title,
        type: s.chat.type,
        total: s.total,
        perDay: s.perDay,
        myShare: mine && s.total ? Math.round((mine.messages / s.total) * 100) : null,
        myMedianReply: mine?.medianReplySeconds ?? null,
        theirMedianReply: median(theirs),
        last: s.last,
        longestStreak: s.streak.longest,
      };
    })
    .sort((a, b) => b.total - a.total);
}

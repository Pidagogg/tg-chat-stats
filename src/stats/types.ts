// The one message format both sources produce (GramJS login, Telegram Desktop
// export), so the stats engine never cares where the history came from.
// Only what the stats need is kept: no media, no files, and text only for word
// and emoji counts — and all of it stays on the device.

export type MsgKind =
  | "text"
  | "voice"
  | "video_note"
  | "sticker"
  | "photo"
  | "video"
  | "gif"
  | "audio"
  | "file"
  | "poll"
  | "location"
  | "contact"
  | "other";

export interface Msg {
  id: number;
  /** unix seconds */
  date: number;
  /** stable sender id ("user123", "channel456") */
  from: string;
  fromName: string;
  kind: MsgKind;
  text: string;
  replyTo?: number;
  /** voice / video note / video / audio length in seconds */
  duration?: number;
  /** total reactions on the message */
  reactions?: number;
  edited?: boolean;
  forwarded?: boolean;
}

export type ChatType = "private" | "group" | "channel";

export interface ChatData {
  id: string;
  title: string;
  type: ChatType;
  /** the viewer's own sender id, when known */
  me?: string;
  /** oldest first */
  messages: Msg[];
}

export interface SenderStats {
  id: string;
  name: string;
  messages: number;
  words: number;
  chars: number;
  kinds: Partial<Record<MsgKind, number>>;
  voiceSeconds: number;
  /** median seconds this sender took to answer someone else */
  medianReplySeconds: number | null;
  replies: number;
  /** conversations this sender opened (first message after a long pause) */
  starts: number;
  longestMessage: number;
  reactionsReceived: number;
}

export interface Stats {
  chat: { id: string; title: string; type: ChatType };
  total: number;
  first: number | null;
  last: number | null;
  activeDays: number;
  perDay: number;
  senders: SenderStats[];
  kinds: Partial<Record<MsgKind, number>>;
  /** [weekday 0=Mon..6=Sun][hour 0..23] */
  heatmap: number[][];
  byHour: number[];
  byWeekday: number[];
  /** "YYYY-MM" → count */
  byMonth: Array<{ month: string; count: number }>;
  streak: { longest: number; longestFrom: string | null; current: number };
  busiestDay: { day: string; count: number } | null;
  topWords: Array<{ word: string; count: number }>;
  topEmojis: Array<{ emoji: string; count: number }>;
  /** group chats: who answers whom most */
  replyPairs: Array<{ from: string; to: string; count: number }>;
  mostReacted: Array<{ id: number; from: string; reactions: number; preview: string }>;
}

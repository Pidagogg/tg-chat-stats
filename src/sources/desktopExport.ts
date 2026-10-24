// Telegram Desktop export (Settings → Advanced → Export Telegram data, or a
// chat's ⋮ → Export chat history, format "Machine-readable JSON"). The file is
// read in the browser with the File API — nothing is uploaded.
//
// Two shapes exist: a single chat ({ name, type, id, messages }) and a full
// account export ({ personal_information, chats: { list: [...] } }). The full
// export also tells us who "me" is.
import type { ChatData, ChatType, Msg, MsgKind } from "../stats/types.ts";

type Json = Record<string, unknown>;

const PRIVATE = new Set(["personal_chat", "bot_chat", "saved_messages"]);
const CHANNEL = new Set(["public_channel", "private_channel"]);

function chatType(t: unknown): ChatType {
  const s = String(t || "");
  if (PRIVATE.has(s)) return "private";
  if (CHANNEL.has(s)) return "channel";
  return "group";
}

/** Plain text of a message: a string, or an array of strings and { text } parts. */
export function exportText(text: unknown): string {
  if (typeof text === "string") return text;
  if (Array.isArray(text)) return text.map((p) => (typeof p === "string" ? p : String((p as Json)?.text ?? ""))).join("");
  return "";
}

function kindOf(m: Json): MsgKind {
  switch (m.media_type) {
    case "voice_message":
      return "voice";
    case "video_message":
      return "video_note";
    case "sticker":
      return "sticker";
    case "animation":
      return "gif";
    case "video_file":
      return "video";
    case "audio_file":
      return "audio";
  }
  if (m.photo) return "photo";
  if (m.poll) return "poll";
  if (m.location_information || m.place_name) return "location";
  if (m.contact_information) return "contact";
  if (m.file) return "file";
  return exportText(m.text) ? "text" : "other";
}

function reactionsOf(m: Json) {
  const r = m.reactions;
  if (!Array.isArray(r)) return 0;
  return r.reduce((sum: number, x) => sum + (Number((x as Json)?.count) || 0), 0);
}

export function parseChat(raw: Json, me?: string): ChatData {
  const messages: Msg[] = [];
  for (const m of (Array.isArray(raw.messages) ? raw.messages : []) as Json[]) {
    if (m.type !== "message") continue; // service messages (joins, pins, calls) are not chat content
    const date = Number(m.date_unixtime) || Math.floor(Date.parse(String(m.date)) / 1000);
    if (!Number.isFinite(date)) continue;
    messages.push({
      id: Number(m.id),
      date,
      from: String(m.from_id || m.actor_id || "unknown"),
      fromName: String(m.from ?? m.actor ?? "Deleted account"),
      kind: kindOf(m),
      text: exportText(m.text),
      ...(m.reply_to_message_id !== undefined ? { replyTo: Number(m.reply_to_message_id) } : {}),
      ...(m.duration_seconds !== undefined ? { duration: Number(m.duration_seconds) } : {}),
      ...(reactionsOf(m) ? { reactions: reactionsOf(m) } : {}),
      ...(m.edited ? { edited: true } : {}),
      ...(m.forwarded_from ? { forwarded: true } : {}),
    });
  }
  return {
    id: String(raw.id ?? raw.name ?? "chat"),
    title: String(raw.name || (raw.type === "saved_messages" ? "Saved Messages" : "Chat")),
    type: chatType(raw.type),
    ...(me ? { me } : {}),
    messages,
  };
}

/** Every chat in an export file (one for a single-chat export). */
export function parseExport(raw: unknown): ChatData[] {
  if (!raw || typeof raw !== "object") throw new Error("This is not a Telegram export file.");
  const r = raw as Json;
  const personal = r.personal_information as Json | undefined;
  const me = personal?.user_id !== undefined ? `user${personal.user_id}` : undefined;
  const list = (r.chats as Json | undefined)?.list;
  if (Array.isArray(list)) return (list as Json[]).filter((c) => Array.isArray(c.messages)).map((c) => parseChat(c, me));
  if (Array.isArray(r.messages)) return [parseChat(r, me)];
  throw new Error("No chats found — export with the format “Machine-readable JSON”.");
}

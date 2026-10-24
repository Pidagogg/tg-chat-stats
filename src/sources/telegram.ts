// Telegram login and history download, entirely in the browser.
//
// GramJS speaks MTProto to Telegram's data centres over WebSocket
// (wss://*.web.telegram.org) — straight from this device, never through a
// server of ours. The session string stays in this device's storage and can
// be wiped with "Log out" (which also ends the session at Telegram).
//
// GramJS (the `telegram` package) is archived; `teleproto` is its maintained
// fork. Everything GramJS-specific lives in this file so a switch is local.
import type { ChatData, ChatType, Msg, MsgKind } from "../stats/types.ts";
import { deliveryOf, nextKindOf, type Delivery, type DeliveryKind } from "./codeDelivery.ts";

const SESSION_KEY = "tgstats.session";
const API_ID = Number(import.meta.env.VITE_TG_API_ID || 0);
const API_HASH = String(import.meta.env.VITE_TG_API_HASH || "");

export const telegramConfigured = () => API_ID > 0 && API_HASH.length > 0;

type GramJs = typeof import("telegram");
let lib: GramJs | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

async function gram() {
  lib ??= await import("telegram");
  return lib;
}

function savedSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

async function getClient() {
  if (client) return client;
  const { TelegramClient } = await gram();
  const { StringSession } = await import("telegram/sessions");
  client = new TelegramClient(new StringSession(savedSession()), API_ID, API_HASH, { connectionRetries: 3, useWSS: true, deviceModel: "Chat Stats", appVersion: "1.0" });
  // Telegram limits history requests; GramJS waits out FLOOD_WAIT up to this many seconds by itself.
  client.floodSleepThreshold = 300;
  client.setLogLevel?.("error");
  await client.connect();
  return client;
}

function persist() {
  try {
    localStorage.setItem(SESSION_KEY, client.session.save());
  } catch {
    /* storage blocked — the login lasts for this visit only */
  }
}

export async function isLoggedIn() {
  if (!telegramConfigured() || !savedSession()) return false;
  try {
    return await (await getClient()).checkAuthorization();
  } catch {
    return false;
  }
}

export interface LoginPrompts {
  code: () => Promise<string>;
  password: (hint?: string) => Promise<string>;
  onError: (err: Error) => void;
}

// ---- phone login, step by step ----
// Not GramJS's start(): it hides where Telegram sent the code, and can't
// resend it another way or set up the login e-mail Telegram may demand first.

export interface CodeRequest {
  phone: string;
  hash: string;
  delivery: Delivery;
  /** the other way Telegram offers for "send the code another way" */
  next: DeliveryKind | null;
  /** seconds before that other way may be used */
  timeout?: number;
  /** Telegram logged the device in straight away */
  done?: boolean;
}

// Telegram's own error names (PHONE_CODE_INVALID, FLOOD_WAIT_…) are the useful part
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcError = (err: any) => new Error(err?.errorMessage || err?.message || String(err));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function codeRequest(phone: string, sent: any): CodeRequest {
  if (sent?.className === "auth.SentCodeSuccess") return { phone, hash: "", delivery: { kind: "app" }, next: null, done: true };
  const req = { phone, hash: sent.phoneCodeHash, delivery: deliveryOf(sent.type), next: nextKindOf(sent.nextType), timeout: sent.timeout };
  // where the code went is the first question when a login fails; no number or code is logged
  console.info("[chat-stats] login code:", req.delivery.kind, "· another way:", req.next ?? "none");
  return req;
}

export async function requestCode(phone: string): Promise<CodeRequest> {
  const c = await getClient();
  const { Api } = await gram();
  try {
    const sent = await c.invoke(new Api.auth.SendCode({ phoneNumber: phone, apiId: API_ID, apiHash: API_HASH, settings: new Api.CodeSettings({}) }));
    const req = codeRequest(phone, sent);
    if (req.done) persist();
    return req;
  } catch (err) {
    throw rpcError(err);
  }
}

export async function resendCode(req: CodeRequest): Promise<CodeRequest> {
  const c = await getClient();
  const { Api } = await gram();
  try {
    return codeRequest(req.phone, await c.invoke(new Api.auth.ResendCode({ phoneNumber: req.phone, phoneCodeHash: req.hash })));
  } catch (err) {
    throw rpcError(err);
  }
}

/** Telegram wants a login e-mail before it sends any code: send a code to that address. */
export async function setUpLoginEmail(req: CodeRequest, email: string) {
  const c = await getClient();
  const { Api } = await gram();
  try {
    await c.invoke(new Api.account.SendVerifyEmailCode({ purpose: new Api.EmailVerifyPurposeLoginSetup({ phoneNumber: req.phone, phoneCodeHash: req.hash }), email }));
  } catch (err) {
    throw rpcError(err);
  }
}

/** Confirm the new login e-mail; Telegram answers with the real login code request. */
export async function confirmLoginEmail(req: CodeRequest, code: string): Promise<CodeRequest> {
  const c = await getClient();
  const { Api } = await gram();
  try {
    const verified = await c.invoke(
      new Api.account.VerifyEmail({
        purpose: new Api.EmailVerifyPurposeLoginSetup({ phoneNumber: req.phone, phoneCodeHash: req.hash }),
        verification: new Api.EmailVerificationCode({ code }),
      })
    );
    return codeRequest(req.phone, verified.sentCode);
  } catch (err) {
    throw rpcError(err);
  }
}

/** "done", or "password" when two-step verification is on. */
export async function signIn(req: CodeRequest, code: string): Promise<"done" | "password"> {
  const c = await getClient();
  const { Api } = await gram();
  try {
    const result = await c.invoke(
      req.delivery.kind === "email"
        ? new Api.auth.SignIn({ phoneNumber: req.phone, phoneCodeHash: req.hash, emailVerification: new Api.EmailVerificationCode({ code }) })
        : new Api.auth.SignIn({ phoneNumber: req.phone, phoneCodeHash: req.hash, phoneCode: code })
    );
    if (result?.className === "auth.AuthorizationSignUpRequired") throw new Error("This number has no Telegram account.");
    persist();
    return "done";
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.errorMessage === "SESSION_PASSWORD_NEEDED") return "password";
    throw rpcError(err);
  }
}

export async function passwordHint(): Promise<string> {
  const { Api } = await gram();
  return (await (await getClient()).invoke(new Api.account.GetPassword())).hint || "";
}

export async function signInPassword(password: string) {
  const c = await getClient();
  const { Api } = await gram();
  const { computeCheck } = await import("telegram/Password");
  try {
    await c.invoke(new Api.auth.CheckPassword({ password: await computeCheck(await c.invoke(new Api.account.GetPassword()), password) }));
    persist();
  } catch (err) {
    throw rpcError(err);
  }
}

export async function loginWithQr(onQr: (url: string) => void, prompts: Omit<LoginPrompts, "code">) {
  const c = await getClient();
  await c.signInUserWithQrCode(
    { apiId: API_ID, apiHash: API_HASH },
    {
      qrCode: async ({ token }: { token: Uint8Array }) => {
        let b64 = btoa(String.fromCharCode(...token));
        b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        onQr(`tg://login?token=${b64}`);
      },
      password: prompts.password,
      onError: (err: Error) => {
        prompts.onError(err);
        return Promise.resolve(true);
      },
    }
  );
  persist();
}

export async function logout() {
  try {
    const { Api } = await gram();
    if (client) await client.invoke(new Api.auth.LogOut());
  } catch {
    /* already logged out */
  }
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    await client?.disconnect();
  } catch {
    /* ignore */
  }
  client = null;
}

export interface DialogInfo {
  id: string;
  title: string;
  type: ChatType;
  /** the dialog object GramJS needs to fetch the history */
  entity: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nameOf = (e: any) => (e ? e.title || [e.firstName, e.lastName].filter(Boolean).join(" ") || e.username || "" : "");

export async function listDialogs(limit = 200): Promise<DialogInfo[]> {
  const c = await getClient();
  const dialogs = await c.getDialogs({ limit });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return dialogs.map((d: any) => ({
    id: String(d.id),
    title: d.title || nameOf(d.entity) || "Chat",
    type: d.isUser ? "private" : d.isChannel && !d.isGroup ? "channel" : "group",
    entity: d.entity,
  }));
}

// ---- message mapping ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function kindOfMessage(m: any): MsgKind {
  const media = m.media;
  if (!media) return m.message ? "text" : "other";
  switch (media.className) {
    case "MessageMediaPhoto":
      return "photo";
    case "MessageMediaPoll":
      return "poll";
    case "MessageMediaGeo":
    case "MessageMediaGeoLive":
    case "MessageMediaVenue":
      return "location";
    case "MessageMediaContact":
      return "contact";
    case "MessageMediaDocument": {
      const attrs: Array<{ className: string; voice?: boolean; roundMessage?: boolean }> = media.document?.attributes || [];
      const has = (n: string) => attrs.find((a) => a.className === n);
      if (has("DocumentAttributeAudio")?.voice) return "voice";
      if (has("DocumentAttributeVideo")?.roundMessage) return "video_note";
      if (has("DocumentAttributeSticker")) return "sticker";
      if (has("DocumentAttributeAnimated")) return "gif";
      if (has("DocumentAttributeVideo")) return "video";
      if (has("DocumentAttributeAudio")) return "audio";
      return "file";
    }
    default:
      return m.message ? "text" : "other";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function durationOf(m: any) {
  const attrs: Array<{ className: string; duration?: number }> = m.media?.document?.attributes || [];
  const a = attrs.find((x) => x.className === "DocumentAttributeAudio" || x.className === "DocumentAttributeVideo");
  return a?.duration ? Math.round(Number(a.duration)) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function peerKey(p: any) {
  if (!p) return "";
  if (p.userId !== undefined) return `user${p.userId}`;
  if (p.channelId !== undefined) return `channel${p.channelId}`;
  if (p.chatId !== undefined) return `chat${p.chatId}`;
  return "";
}

export interface DownloadOptions {
  /** stop after this many messages (newest first) */
  limit?: number;
  /** only messages after this unix time */
  since?: number;
  onProgress?: (count: number) => void;
  signal?: AbortSignal;
}

/** Download one chat's history and map it to the stats format. */
export async function downloadChat(d: DialogInfo, opts: DownloadOptions = {}): Promise<ChatData> {
  const c = await getClient();
  const me = await c.getMe();
  const meKey = `user${me.id}`;
  const meName = nameOf(me) || "Me";
  const peerName = d.title;
  const messages: Msg[] = [];
  const names = new Map<string, string>();
  for await (const m of c.iterMessages(d.entity, { limit: opts.limit ?? 50000 })) {
    if (opts.signal?.aborted) break;
    if (opts.since && m.date < opts.since) break;
    if (m.className !== "Message") continue; // MessageService: joins, pins, calls
    let from = peerKey(m.fromId);
    if (!from) from = d.type === "private" ? (m.out ? meKey : `user${d.id}`) : `chat${d.id}`;
    if (!names.has(from)) {
      const sender = m.sender || m._sender;
      names.set(from, from === meKey ? meName : nameOf(sender) || (d.type === "private" ? peerName : from));
    }
    const reactions = (m.reactions?.results || []).reduce((s: number, r: { count?: number }) => s + (r.count || 0), 0);
    messages.push({
      id: m.id,
      date: m.date,
      from,
      fromName: names.get(from) || from,
      kind: kindOfMessage(m),
      text: m.message || "",
      ...(m.replyTo?.replyToMsgId ? { replyTo: m.replyTo.replyToMsgId } : {}),
      ...(durationOf(m) ? { duration: durationOf(m) } : {}),
      ...(reactions ? { reactions } : {}),
      ...(m.editDate ? { edited: true } : {}),
      ...(m.fwdFrom ? { forwarded: true } : {}),
    });
    if (messages.length % 200 === 0) opts.onProgress?.(messages.length);
  }
  opts.onProgress?.(messages.length);
  messages.reverse();
  return { id: d.id, title: d.title, type: d.type, me: meKey, messages };
}

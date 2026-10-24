// ============================================================================
// Chat Stats — the bot. /start sends the W flow ad (W flow pays for the bot),
// then what the bot does, with a keyboard at the bottom: open the Mini App, or
// "what this bot does" again. /wflow repeats the ad, anything else gets the
// info. The Mini App is also the chat's menu button. It never reads chat
// history (a bot can't anyway) and keeps no
// data: no database, no logs of messages. Long polling over the plain Bot
// HTTP API with fetch, no dependencies.
//
//   BOT_TOKEN   from @BotFather
//   WEBAPP_URL  https://w-flow.tech/tg-stats/
// ============================================================================
const TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://w-flow.tech/tg-stats/";
const promoUrl = (campaign) => `https://w-flow.tech/?utm_source=tg-stats&utm_medium=bot&utm_campaign=${campaign}`;
if (!TOKEN) {
  console.error("Set BOT_TOKEN (from @BotFather).");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

const TEXT = {
  en: {
    about:
      "📊 *Chat Stats* — who writes more, when you talk, how fast you answer, top words and emojis. 🔎 Search any word and see who wrote it how often. For private chats and groups, and you can compare chats.\n\n🔒 Everything is analysed on *your* device. No message ever reaches a server — not even ours.",
    open: "Open Chat Stats",
    menu: "Stats",
    short: "Telegram chat stats, analysed on your device. Automate your Telegram with w-flow.tech",
    keyOpen: "📊 Open Chat Stats",
    keyAbout: "ℹ️ What this bot does",
    pitch:
      "⚙️ *W flow* — build automations by dragging blocks, no code.\n\n• a Telegram bot that answers with AI\n• new messages → Google Sheets, Notion or e-mail\n• a daily digest (news, RSS, prices) posted to your group or channel\n• 100+ services: GitHub, Stripe, Slack, webhooks…\n\nFree to start, or self-host it on your own server.",
    pitchButton: "Try W flow free",
    cmdStart: "Open Chat Stats",
    cmdWflow: "Automate your Telegram with W flow",
  },
  ru: {
    about:
      "📊 *Статистика чатов* — кто пишет больше, когда вы общаетесь, как быстро отвечаете, частые слова и эмодзи. 🔎 Найдите любое слово и узнайте, кто и сколько раз его написал. Для личных чатов и групп, можно сравнивать чаты.\n\n🔒 Всё анализируется на *вашем* устройстве. Ни одно сообщение не попадает на сервер — даже на наш.",
    open: "Открыть статистику",
    menu: "Статистика",
    short: "Статистика чатов Telegram прямо на вашем устройстве. Автоматизируйте Telegram с w-flow.tech",
    keyOpen: "📊 Открыть статистику",
    keyAbout: "ℹ️ Что умеет этот бот",
    pitch:
      "⚙️ *W flow* — автоматизации из блоков, без кода.\n\n• бот в Telegram, который отвечает с помощью ИИ\n• новые сообщения → Google Таблицы, Notion или почта\n• ежедневная сводка (новости, RSS, курсы) в вашу группу или канал\n• 100+ сервисов: GitHub, Stripe, Slack, вебхуки…\n\nБесплатный старт или своя копия на вашем сервере.",
    pitchButton: "Попробовать W flow бесплатно",
    cmdStart: "Открыть статистику",
    cmdWflow: "Автоматизировать Telegram с W flow",
  },
};
const langOf = (code) => (/^(ru|uk|be|kk)/i.test(code || "") ? "ru" : "en");

async function call(method, body) {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method}: ${data.description || res.status}`);
  return data.result;
}

async function setup() {
  // The menu button next to the input field opens the Mini App directly.
  await call("setChatMenuButton", { menu_button: { type: "web_app", text: TEXT.en.menu, web_app: { url: WEBAPP_URL } } });
  for (const lang of ["en", "ru"]) {
    const t = TEXT[lang];
    const description = t.about.replace(/\*/g, "").slice(0, 512);
    await call("setMyDescription", { description, ...(lang === "en" ? {} : { language_code: lang }) }).catch(() => {});
    await call("setMyShortDescription", { short_description: t.short.slice(0, 120), ...(lang === "en" ? {} : { language_code: lang }) }).catch(() => {});
    const commands = [
      { command: "start", description: t.cmdStart },
      { command: "wflow", description: t.cmdWflow },
    ];
    await call("setMyCommands", { commands, ...(lang === "en" ? {} : { language_code: lang }) }).catch(() => {});
  }
}

// The keyboard at the bottom of the chat stays until the user hides it.
const keyboard = (t) => ({
  keyboard: [[{ text: t.keyOpen, web_app: { url: WEBAPP_URL } }], [{ text: t.keyAbout }]],
  resize_keyboard: true,
  is_persistent: true,
});

const send = (chatId, text, replyMarkup) =>
  call("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", link_preview_options: { is_disabled: true }, reply_markup: replyMarkup });

// ---- the ad: an album of pictures (ad/render.mjs → public/ad/, shipped with
// the Mini App), then the pitch with its button. An album can't carry
// buttons, so the button rides on the text. Telegram fetches the pictures by
// URL once; after that their file_ids are reused, so nothing is fetched again.
const AD_PICTURES = ["1-hero", "2-ai-bot", "3-digest", "4-sheets"];
const adFileIds = { en: null, ru: null };

async function sendPictures(chatId, lang) {
  const media = AD_PICTURES.map((name, i) => ({ type: "photo", media: adFileIds[lang]?.[i] || new URL(`ad/${lang}-${name}.png`, WEBAPP_URL).href }));
  const sent = await call("sendMediaGroup", { chat_id: chatId, media });
  adFileIds[lang] = sent.map((m) => m.photo.at(-1).file_id);
}

async function sendAd(chatId, lang, campaign) {
  const t = TEXT[lang];
  // a picture that can't be fetched must not cost the pitch itself
  await sendPictures(chatId, lang).catch((err) => console.error("ad pictures:", err.message));
  await send(chatId, t.pitch, { inline_keyboard: [[{ text: t.pitchButton, url: promoUrl(campaign) }]] });
}

async function reply(msg) {
  const lang = langOf(msg.from?.language_code);
  const t = TEXT[lang];
  const text = msg.text || "";
  if (/^\/start(@\w+)?(\s|$)/i.test(text)) {
    await sendAd(msg.chat.id, lang, "start");
    await send(msg.chat.id, t.about, keyboard(t));
  } else if (/^\/wflow(@\w+)?(\s|$)/i.test(text)) {
    await sendAd(msg.chat.id, lang, "command");
  } else {
    // "what this bot does" from the keyboard, or anything else
    await send(msg.chat.id, t.about, { inline_keyboard: [[{ text: t.open, web_app: { url: WEBAPP_URL } }]] });
  }
}

async function main() {
  await setup().catch((err) => console.error("setup:", err.message));
  let offset = 0;
  console.log(`Chat Stats bot running, Mini App at ${WEBAPP_URL}`);
  for (;;) {
    try {
      const updates = await call("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        // only private chats: in groups the bot stays silent
        if (u.message?.chat?.type === "private") await reply(u.message).catch((err) => console.error("reply:", err.message));
      }
    } catch (err) {
      console.error("poll:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main();

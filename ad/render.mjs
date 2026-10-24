// ============================================================================
// The pictures for the bot's W flow ad. Each slide is a small HTML page in
// W flow's look (the og-image style), screenshotted by headless Chrome or Edge
// into public/ad/, so Vite ships them at https://w-flow.tech/tg-stats/ad/ and
// the bot sends them by URL. The flows only use nodes W flow really has.
//
//   node ad/render.mjs        (needs Chrome or Edge installed)
// ============================================================================
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "ad");
const W = 1280;
const H = 720;

const BROWSERS = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) {
  console.error("No Chrome or Edge found — set CHROME to its path.");
  process.exit(1);
}
const logo = `data:image/png;base64,${fs.readFileSync(path.join(here, "wflow-logo.png")).toString("base64")}`;

// ---- texts ----
const TEXT = {
  en: {
    heroTitle: 'Make your <span class="b">Telegram</span><br>work for you',
    heroSub: "Automations and AI agents from blocks — no code",
    chips: ["Telegram", "AI", "Google Sheets", "Notion", "RSS"],
    free: "Free to start",
    botTitle: 'An <span class="b">AI bot</span> that answers for you',
    botSub: "Every new message gets a smart reply — in your own words",
    digestTitle: 'Fresh news <span class="b">posted to your channel</span>',
    digestSub: "New posts from any site, summarised by AI",
    sheetsTitle: 'Every message <span class="b">saved</span> automatically',
    sheetsSub: "Orders, leads, feedback → straight into a spreadsheet",
    nodes: {
      tgIn: ["Telegram — New Message", "TRIGGER", "a customer writes"],
      agent: ["AI Agent", "AI", "understands and answers"],
      tgOut: ["Telegram — Send Message", "ACTION", "reply in the chat"],
      rss: ["RSS Feed — New Item", "TRIGGER", "a new post on a site"],
      summary: ["AI Agent", "AI", "summarise in 3 lines"],
      post: ["Telegram — Send Message", "ACTION", "post to @yourchannel"],
      sheets: ["Google Sheets — Append Row", "ACTION", "name · text · date"],
    },
  },
  ru: {
    heroTitle: 'Пусть <span class="b">Telegram</span><br>работает за вас',
    heroSub: "Автоматизации и ИИ-агенты из блоков — без кода",
    chips: ["Telegram", "ИИ", "Google Таблицы", "Notion", "RSS"],
    free: "Бесплатный старт",
    botTitle: '<span class="b">ИИ-бот</span>, который отвечает за вас',
    botSub: "На каждое сообщение — умный ответ вашими словами",
    digestTitle: 'Свежие новости <span class="b">в вашем канале</span>',
    digestSub: "Новые посты с любого сайта — кратко, с помощью ИИ",
    sheetsTitle: 'Каждое сообщение <span class="b">сохраняется</span> само',
    sheetsSub: "Заказы, заявки, отзывы → сразу в таблицу",
    nodes: {
      tgIn: ["Telegram — New Message", "ТРИГГЕР", "пишет клиент"],
      agent: ["AI Agent", "ИИ", "понимает и отвечает"],
      tgOut: ["Telegram — Send Message", "ДЕЙСТВИЕ", "ответ в чате"],
      rss: ["RSS Feed — New Item", "ТРИГГЕР", "новый пост на сайте"],
      summary: ["AI Agent", "ИИ", "пересказ в 3 строки"],
      post: ["Telegram — Send Message", "ДЕЙСТВИЕ", "пост в @вашканал"],
      sheets: ["Google Sheets — Append Row", "ДЕЙСТВИЕ", "имя · текст · дата"],
    },
  },
};

// ---- page parts ----
const CSS = `
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #e8ecf8;
  background: radial-gradient(900px 600px at 85% 10%, #26345e 0%, transparent 60%), radial-gradient(700px 500px at 0% 100%, #12324a 0%, transparent 60%), #0b1020; }
body::before { content: ""; position: absolute; inset: 0; opacity: .35;
  background-image: linear-gradient(#1a2440 1px, transparent 1px), linear-gradient(90deg, #1a2440 1px, transparent 1px); background-size: 48px 48px; }
.page { position: relative; height: 100%; padding: 64px 80px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 800; letter-spacing: .5px; }
.brand img { height: 56px; }
.brand .b { color: #6f8cff; }
h1 { font-size: 64px; line-height: 1.12; font-weight: 900; margin-top: 44px; max-width: 1120px; }
h1.hero { font-size: 92px; line-height: 1.05; margin-top: 70px; }
.sub.hero { font-size: 34px; margin-top: 26px; }
h1.small { font-size: 52px; margin-top: 30px; }
.b { color: #6f8cff; }
.sub { font-size: 28px; color: #a9b4d0; margin-top: 18px; }
.foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; }
.chips { display: flex; gap: 12px; }
.chip { border: 1px solid #2c3a63; background: #121a33; border-radius: 999px; padding: 10px 22px; font-size: 22px; }
.url { color: #6f8cff; font-size: 28px; font-weight: 800; }
.free { background: #4a6cff; color: #fff; border-radius: 12px; padding: 12px 26px; font-size: 24px; font-weight: 700; }
.flow { display: flex; align-items: center; gap: 0; margin-top: 54px; }
.node { width: 330px; border: 1px solid #33427a; background: #121a33; border-radius: 14px; padding: 18px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.node .t { display: flex; gap: 12px; align-items: center; }
.node .ic { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; font-size: 22px; background: #1d2850; flex: none; }
.node .n { font-size: 19px; font-weight: 700; line-height: 1.2; }
.node .k { font-size: 13px; letter-spacing: 2px; color: #7f8bb0; margin-top: 3px; }
.node .d { margin-top: 14px; padding-top: 12px; border-top: 1px solid #26335f; font-size: 19px; color: #c3cbe4; }
.wire { flex: 1; height: 3px; background: linear-gradient(90deg, #4a6cff, #8aa0ff); position: relative; min-width: 40px; }
.wire::after { content: ""; position: absolute; right: -2px; top: -6px; border: 7.5px solid transparent; border-left: 11px solid #8aa0ff; }
`;

const node = ([name, kind, desc], icon) =>
  `<div class="node"><div class="t"><div class="ic">${icon}</div><div><div class="n">${name}</div><div class="k">${kind}</div></div></div><div class="d">${desc}</div></div>`;
const flow = (...parts) => `<div class="flow">${parts.join('<div class="wire"></div>')}</div>`;
const brand = `<div class="brand"><img src="${logo}" alt=""><span>W <span class="b">flow</span></span></div>`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">${body}</div></body></html>`;

function slides(t) {
  const n = t.nodes;
  const foot = `<div class="foot"><div class="free">${t.free}</div><div class="url">w-flow.tech</div></div>`;
  return {
    "1-hero": page(
      `${brand}<h1 class="hero">${t.heroTitle}</h1><div class="sub hero">${t.heroSub}</div><div class="foot"><div class="chips">${t.chips.map((c) => `<div class="chip">${c}</div>`).join("")}</div><div class="url">w-flow.tech</div></div>`
    ),
    "2-ai-bot": page(`${brand}<h1 class="small">${t.botTitle}</h1><div class="sub">${t.botSub}</div>${flow(node(n.tgIn, "✈️"), node(n.agent, "✨"), node(n.tgOut, "💬"))}${foot}`),
    "3-digest": page(`${brand}<h1 class="small">${t.digestTitle}</h1><div class="sub">${t.digestSub}</div>${flow(node(n.rss, "📰"), node(n.summary, "✨"), node(n.post, "📣"))}${foot}`),
    "4-sheets": page(`${brand}<h1 class="small">${t.sheetsTitle}</h1><div class="sub">${t.sheetsSub}</div>${flow(node(n.tgIn, "✈️"), node(n.sheets, "📊"))}${foot}`),
  };
}

// ---- render ----
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ad-"));
for (const [lang, t] of Object.entries(TEXT)) {
  for (const [name, html] of Object.entries(slides(t))) {
    const file = path.join(tmp, `${lang}-${name}.html`);
    fs.writeFileSync(file, html);
    const png = path.join(out, `${lang}-${name}.png`);
    execFileSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${W},${H}`, `--screenshot=${png}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "ignore" });
    console.log("wrote", path.relative(process.cwd(), png));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

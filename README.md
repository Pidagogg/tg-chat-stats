# Chat Stats

A Telegram bot + Mini App that shows statistics for any chat: who writes how much, message types, when you talk (hours, weekdays, heatmap), reply times, who starts conversations, streaks, top words and emojis, and for groups who answers whom. Compare several chats side by side, and share a stats image.

**The server never receives a message.** The Mini App is static files. Login (GramJS, MTProto over WebSocket) and the analysis (a Web Worker) run on your device. As the alternative to logging in, you can open a Telegram Desktop JSON export, which is read locally. The page's Content-Security-Policy only allows connections to Telegram itself, and you can check that in DevTools.

## Run locally

```bash
npm install
cp .env.example .env      # add VITE_TG_API_ID / VITE_TG_API_HASH from my.telegram.org
npm run dev               # http://localhost:5173/tg-stats/
npm test                  # stats engine + export parser
npm run build             # → dist/
```

Without API keys the login button stays disabled. The Desktop-export path works without any keys.

## Deploy (same VPS as W flow, no own domain)

1. Build `dist/` and copy it to `/srv/tg-stats` on the VPS.
2. The route is already in W flow's own `Caddyfile` (same block as `deploy/Caddyfile.snippet`), and W flow's `docker-compose.yml` mounts `/srv/tg-stats` into Caddy, so a W flow deploy keeps it. The Mini App is at `https://w-flow.tech/tg-stats/`.
3. BotFather:
   - `/newbot` (e.g. `@chat_stats_bot`), then copy the token into `deploy/bot.env` as `BOT_TOKEN=…`.
   - `/newapp`: set the Web App URL to `https://w-flow.tech/tg-stats/`.
4. Copy `bot/` and `deploy/` (with `bot.env`, mode 600) to `/opt/tg-chat-stats`, then start the bot: `docker compose -f deploy/docker-compose.bot.yml -p tg-chat-stats up -d`.

## Layout

| Path | What |
|---|---|
| `src/stats/engine.ts` | pure stats (tested) |
| `src/sources/desktopExport.ts` | Telegram Desktop JSON export parser |
| `src/sources/telegram.ts` | GramJS login + history download (the only GramJS-specific file) |
| `src/stats/worker.ts` | runs the engine off the main thread |
| `src/ui/` | screens, charts, the share image |
| `bot/bot.mjs` | the bot: `/start` → "Open" button, no data kept |

GramJS (`telegram` on npm) is archived. `teleproto` is its maintained fork; switching only touches `src/sources/telegram.ts`.

## License

MIT

## Repositories

`Pidagogg/tg-chat-stats-private` holds the full history and internal notes. The public `Pidagogg/tg-chat-stats` gets a clean copy of the last commit without them: `bash scripts/publish-public.sh --push`.

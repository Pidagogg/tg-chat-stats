import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// The privacy promise, enforced by the browser: the page may only connect to
// itself and to Telegram's own servers (MTProto over WebSocket). No analytics,
// no third-party scripts except Telegram's Mini App SDK, nowhere else to send
// a message. Anyone can check it in DevTools. Shared with deploy/Caddyfile,
// which also sends it as a header (with frame-ancestors, which a meta tag
// cannot carry). Only the build gets it: the dev server needs inline scripts.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "connect-src 'self' wss://*.web.telegram.org https://*.web.telegram.org",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

// Served from https://w-flow.tech/tg-stats/ (a path on the existing domain,
// no domain of its own), so every asset URL is relative to that base.
// GramJS was written for Node and needs Buffer / os / util shims in the browser.
export default defineConfig({
  base: process.env.TG_STATS_BASE || "/tg-stats/",
  plugins: [react(), cspMeta(), nodePolyfills({ include: ["buffer", "os", "util", "events", "stream", "crypto", "path", "process"], globals: { Buffer: true, process: true } })],
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false },
});

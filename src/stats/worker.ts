// Runs the stats engine off the main thread, so a 100k-message chat never
// freezes the Mini App. Input and output stay inside the browser.
import { computeStats } from "./engine.ts";
import type { ChatData } from "./types.ts";

self.onmessage = (e: MessageEvent<{ chats: ChatData[] }>) => {
  try {
    const stats = e.data.chats.map((c) => computeStats(c));
    (self as unknown as Worker).postMessage({ ok: true, stats });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error)?.message || err) });
  }
};

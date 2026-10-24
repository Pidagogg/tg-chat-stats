import type { ChatData, Stats } from "./types.ts";

/** Compute stats for several chats in a Web Worker. */
export function computeInWorker(chats: ChatData[]): Promise<Stats[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; stats?: Stats[]; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.stats) resolve(e.data.stats);
      else reject(new Error(e.data.error || "The analysis failed."));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "The analysis failed."));
    };
    worker.postMessage({ chats });
  });
}

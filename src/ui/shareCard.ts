// The shareable stats image, drawn on a canvas right here. It contains only
// aggregate numbers (and, if the user ticks it, the top words) — never a
// message. Sharing goes through the system share sheet; nothing is uploaded.
// A small "w-flow.tech" in the corner is the only promotion on it.
import type { Stats } from "../stats/types.ts";
import { formatDuration, type Lang, type Texts } from "../i18n.ts";

const W = 1080;
const H = 1350;

export async function drawShareCard(s: Stats, t: Texts, lang: Lang, opts: { words: boolean }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1b2340");
  grad.addColorStop(1, "#3a2a6b");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const font = (size: number, weight = 600) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const text = (str: string, x: number, y: number, size: number, color = "#fff", weight = 600) => {
    g.font = font(size, weight);
    g.fillStyle = color;
    g.fillText(str, x, y);
  };

  text(t.appName.toUpperCase(), 80, 120, 34, "#a9b6ff", 700);
  text(s.chat.title.slice(0, 32), 80, 200, 64, "#fff", 800);
  text(`${s.total.toLocaleString(lang)} ${t.messages} · ${s.perDay} ${t.perDay}`, 80, 262, 36, "#d7dcff", 500);

  // who writes how much
  const top = s.senders.slice(0, 5);
  const max = Math.max(1, ...top.map((x) => x.messages));
  let y = 350;
  text(t.whoWrites, 80, y, 34, "#a9b6ff", 700);
  y += 30;
  for (const p of top) {
    y += 70;
    text(p.name.slice(0, 22), 80, y, 32, "#fff", 600);
    const bw = Math.round((p.messages / max) * 520);
    g.fillStyle = "#6f7dff";
    g.beginPath();
    g.roundRect(480, y - 30, Math.max(8, bw), 36, 10);
    g.fill();
    text(String(p.messages), 480 + Math.max(8, bw) + 16, y, 30, "#d7dcff", 500);
  }

  // highlight tiles
  y += 80;
  const reply = s.senders.map((x) => x.medianReplySeconds).filter((v): v is number => v !== null);
  const tiles: Array<[string, string]> = [
    [t.replyTime, formatDuration(reply.length ? Math.min(...reply) : null, lang)],
    [t.streakLongest, `${s.streak.longest} ${t.days}`],
    [t.busiest, s.busiestDay ? `${s.busiestDay.count}` : "—"],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 80 + i * 310;
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.beginPath();
    g.roundRect(x, y, 290, 170, 22);
    g.fill();
    text(value, x + 24, y + 90, 52, "#fff", 800);
    text(label, x + 24, y + 140, 26, "#c8cdf5", 500);
  });
  y += 230;

  const emo = s.topEmojis.slice(0, 6).map((e) => e.emoji).join("  ");
  if (emo) {
    text(t.topEmojis, 80, y, 34, "#a9b6ff", 700);
    text(emo, 80, y + 70, 56, "#fff", 400);
    y += 130;
  }
  if (opts.words && s.topWords.length) {
    text(t.topWords, 80, y, 34, "#a9b6ff", 700);
    text(s.topWords.slice(0, 6).map((w) => w.word).join(" · ").slice(0, 52), 80, y + 60, 36, "#fff", 500);
  }

  text("w-flow.tech", W - 260, H - 60, 30, "rgba(255,255,255,0.55)", 600);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the image."))), "image/png"));
}

/** System share sheet when available, otherwise a download. */
export async function shareImage(blob: Blob, name: string) {
  const file = new File([blob], `${name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "chat"}-stats.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

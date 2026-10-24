import { useMemo, useState } from "react";
import type { Texts } from "../i18n.ts";

export interface PickItem {
  id: string;
  title: string;
  type: "private" | "group" | "channel";
  hint?: string;
}

/** One chat → its stats; several → a comparison. */
export function ChatPicker({
  t,
  items,
  showRange,
  onPick,
}: {
  t: Texts;
  items: PickItem[];
  showRange: boolean;
  onPick: (ids: string[], range: "12m" | "all") => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [range, setRange] = useState<"12m" | "all">("12m");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => i.title.toLowerCase().includes(s)) : items;
  }, [items, q]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-20)));

  return (
    <div className="card">
      <h2>{t.chats}</h2>
      <p className="muted small">{t.pickHint}</p>
      <input className="search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chat-list">
        {shown.map((i) => (
          <label key={i.id} className={`chat-item ${picked.includes(i.id) ? "on" : ""}`}>
            <input type="checkbox" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />
            <span className="chat-icon">{i.type === "private" ? "👤" : i.type === "channel" ? "📣" : "👥"}</span>
            <span className="chat-title">{i.title}</span>
            {i.hint && <small className="muted">{i.hint}</small>}
          </label>
        ))}
      </div>
      {showRange && (
        <div className="segmented">
          <span className="muted small">{t.range}:</span>
          <button className={range === "12m" ? "on" : ""} onClick={() => setRange("12m")}>
            {t.range12}
          </button>
          <button className={range === "all" ? "on" : ""} onClick={() => setRange("all")}>
            {t.rangeAll}
          </button>
        </div>
      )}
      <button className="btn primary sticky" disabled={!picked.length} onClick={() => onPick(picked, range)}>
        {picked.length > 1 ? `${t.compare} (${picked.length})` : t.analyse}
      </button>
    </div>
  );
}

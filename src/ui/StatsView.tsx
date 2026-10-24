import { useState, type FormEvent, type MouseEvent } from "react";
import { countWord, type CompareRow, type WordCount } from "../stats/engine.ts";
import type { ChatData, MsgKind, Stats } from "../stats/types.ts";
import { formatDuration, type Lang, type Texts } from "../i18n.ts";
import { Bars, Columns, Heatmap } from "./Charts.tsx";
import { drawShareCard, shareImage } from "./shareCard.ts";

const promoUrl = (campaign: string) => `https://w-flow.tech/?utm_source=tg-stats&utm_medium=miniapp&utm_campaign=${campaign}`;

// Inside Telegram's mobile webview a target=_blank link may open nowhere or
// inside the Mini App itself; openLink hands it to the real browser. The SDK
// also loads in a normal browser, where platform is "unknown"; initData can't
// tell the two apart, since a Mini App opened from a keyboard button gets none.
function openExternal(e: MouseEvent<HTMLAnchorElement>) {
  const webApp = (window as unknown as { Telegram?: { WebApp?: { openLink?: (url: string) => void; platform?: string } } }).Telegram?.WebApp;
  if (webApp?.openLink && webApp.platform && webApp.platform !== "unknown") {
    e.preventDefault();
    webApp.openLink(e.currentTarget.href);
  }
}

// quiet: one line for the home screen, before the user has seen anything
export function Promo({ t, campaign = "after-stats", quiet = false }: { t: Texts; campaign?: string; quiet?: boolean }) {
  if (quiet) {
    return (
      <a className="promo-line" href={promoUrl(campaign)} target="_blank" rel="noopener" onClick={openExternal}>
        ⚙️ {t.promoHome} <b>W flow →</b>
      </a>
    );
  }
  return (
    <a className="card promo" href={promoUrl(campaign)} target="_blank" rel="noopener" onClick={openExternal}>
      <span>{t.promo}</span>
      <b>{t.promoCta}</b>
    </a>
  );
}

const dateOf = (ts: number | null, lang: Lang) => (ts ? new Date(ts * 1000).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" }) : "—");

// Who used a word how often. Runs on the messages already on this device, on
// submit rather than per keystroke, so a 100k-message chat stays smooth.
function WordSearch({ chat, t, lang }: { chat: ChatData; t: Texts; lang: Lang }) {
  const [query, setQuery] = useState("");
  const [forms, setForms] = useState(false);
  const [result, setResult] = useState<WordCount | null>(null);
  const search = (e?: FormEvent) => {
    e?.preventDefault();
    setResult(query.trim() ? countWord(chat, query, { forms }) : null);
  };
  const rows = result ? result.senders.filter((p) => p.count > 0 || chat.type === "private").slice(0, 15) : [];
  return (
    <section className="card">
      <h2>{t.searchTitle}</h2>
      <form className="search" onSubmit={search}>
        <input type="search" value={query} placeholder={t.searchPlaceholder} enterKeyHint="search" onChange={(e) => setQuery(e.target.value)} />
        <button className="btn primary" type="submit">
          {t.searchButton}
        </button>
      </form>
      <label className="check">
        <input
          type="checkbox"
          checked={forms}
          onChange={(e) => {
            setForms(e.target.checked);
            if (result) setResult(countWord(chat, query, { forms: e.target.checked }));
          }}
        />
        {t.searchForms}
      </label>
      {result &&
        (result.total ? (
          <>
            <p className="muted small">
              «{result.query}»: {result.total.toLocaleString(lang)} {t.searchTimes}
            </p>
            <Bars rows={rows.map((p) => ({ label: p.name, value: p.count }))} />
          </>
        ) : (
          <p className="muted small">{t.searchNone.replace("{q}", result.query)}</p>
        ))}
    </section>
  );
}

export function StatsView({ s, chat, t, lang, onBack }: { s: Stats; chat?: ChatData; t: Texts; lang: Lang; onBack: () => void }) {
  const [words, setWords] = useState(false);
  const [sharing, setSharing] = useState(false);
  if (!s.total) {
    return (
      <div className="screen">
        <button className="link" onClick={onBack}>
          ← {t.back}
        </button>
        <h1>{s.chat.title}</h1>
        <p className="muted">{t.noMessages}</p>
      </div>
    );
  }
  const kinds = (Object.entries(s.kinds) as Array<[MsgKind, number]>).sort((a, b) => b[1] - a[1]);
  const share = async () => {
    setSharing(true);
    try {
      await shareImage(await drawShareCard(s, t, lang, { words }), s.chat.title);
    } finally {
      setSharing(false);
    }
  };
  const voiceMin = Math.round(s.senders.reduce((sum, x) => sum + x.voiceSeconds, 0) / 60);

  return (
    <div className="screen">
      <button className="link" onClick={onBack}>
        ← {t.back}
      </button>
      <h1>{s.chat.title}</h1>
      <div className="tiles">
        <div className="tile">
          <b>{s.total.toLocaleString(lang)}</b>
          <span>{t.messages}</span>
        </div>
        <div className="tile">
          <b>{s.perDay}</b>
          <span>{t.perDay}</span>
        </div>
        <div className="tile">
          <b>{s.activeDays}</b>
          <span>{t.activeDays}</span>
        </div>
        <div className="tile">
          <b>{s.streak.longest}</b>
          <span>
            {t.streakLongest} ({t.days})
          </span>
        </div>
      </div>
      <p className="muted small">
        {t.since} {dateOf(s.first, lang)} · {t.streakCurrent}: {s.streak.current} {t.days}
        {s.busiestDay ? ` · ${t.busiest}: ${s.busiestDay.day} (${s.busiestDay.count})` : ""}
        {voiceMin ? ` · ${t.voiceMinutes}: ${voiceMin}` : ""}
      </p>

      <section className="card">
        <h2>{t.whoWrites}</h2>
        <Bars rows={s.senders.slice(0, 15).map((p) => ({ label: p.name, value: p.messages }))} />
      </section>

      {s.senders.length > 1 && (
        <section className="card">
          <h2>{t.replyTime}</h2>
          <Bars
            rows={s.senders
              .filter((p) => p.medianReplySeconds !== null)
              .slice(0, 10)
              .map((p) => ({ label: p.name, value: p.medianReplySeconds || 0, hint: formatDuration(p.medianReplySeconds, lang) }))}
          />
          <h3>{t.starts}</h3>
          <Bars rows={s.senders.slice(0, 10).map((p) => ({ label: p.name, value: p.starts }))} />
        </section>
      )}

      <section className="card">
        <h2>{t.types}</h2>
        <Bars rows={kinds.map(([k, v]) => ({ label: t.kinds[k], value: v }))} />
      </section>

      <section className="card">
        <h2>{t.heatmap}</h2>
        <Heatmap grid={s.heatmap} weekdays={t.weekdays} />
        <h3>{t.whenHours}</h3>
        <Columns values={s.byHour} labels={s.byHour.map((_, h) => (h % 6 === 0 ? String(h) : ""))} />
        <h3>{t.whenDays}</h3>
        <Columns values={s.byWeekday} labels={t.weekdays} height={60} />
      </section>

      {s.byMonth.length > 1 && (
        <section className="card">
          <h2>{t.byMonth}</h2>
          <Columns values={s.byMonth.map((m) => m.count)} labels={s.byMonth.map((m, i) => (i === 0 || m.month.endsWith("-01") ? m.month.slice(2) : ""))} />
        </section>
      )}

      {(s.topEmojis.length > 0 || s.topWords.length > 0) && (
        <section className="card">
          {s.topEmojis.length > 0 && (
            <>
              <h2>{t.topEmojis}</h2>
              <div className="chips">
                {s.topEmojis.slice(0, 12).map((e) => (
                  <span className="chip emoji" key={e.emoji}>
                    {e.emoji} <small>{e.count}</small>
                  </span>
                ))}
              </div>
            </>
          )}
          {s.topWords.length > 0 && (
            <>
              <h2>{t.topWords}</h2>
              <div className="chips">
                {s.topWords.slice(0, 20).map((w) => (
                  <span className="chip" key={w.word}>
                    {w.word} <small>{w.count}</small>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {chat && <WordSearch chat={chat} t={t} lang={lang} />}

      {s.chat.type !== "private" && s.replyPairs.length > 0 && (
        <section className="card">
          <h2>{t.replyPairs}</h2>
          <Bars rows={s.replyPairs.map((p) => ({ label: `${p.from} → ${p.to}`, value: p.count }))} />
        </section>
      )}

      {s.mostReacted.length > 0 && (
        <section className="card">
          <h2>{t.mostReacted}</h2>
          {s.mostReacted.map((m) => (
            <p key={m.id} className="small">
              <b>{m.reactions}</b> · {m.from}
              {m.preview ? `: “${m.preview}”` : ""}
            </p>
          ))}
        </section>
      )}

      <section className="card share">
        <label className="check">
          <input type="checkbox" checked={words} onChange={(e) => setWords(e.target.checked)} /> {t.shareWords}
        </label>
        <button className="btn primary" onClick={share} disabled={sharing}>
          {t.share}
        </button>
      </section>

      <Promo t={t} />
    </div>
  );
}

export function CompareView({ rows, t, lang, onOpen, onBack }: { rows: CompareRow[]; t: Texts; lang: Lang; onOpen: (id: string) => void; onBack: () => void }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="screen">
      <button className="link" onClick={onBack}>
        ← {t.back}
      </button>
      <h1>{t.compareTitle}</h1>
      <section className="card">
        <h2>{t.messages}</h2>
        <Bars rows={rows.map((r) => ({ label: r.title, value: r.total }))} max={max} />
      </section>
      {rows.map((r) => (
        <section className="card compare-row" key={r.id}>
          <div className="compare-head">
            <b>{r.title}</b>
            <button className="btn small" onClick={() => onOpen(r.id)}>
              {t.open}
            </button>
          </div>
          <div className="compare-grid">
            <span>
              {r.total.toLocaleString(lang)} {t.messages}
            </span>
            <span>
              {r.perDay} {t.perDay}
            </span>
            {r.myShare !== null && (
              <span>
                {t.myShare}: {r.myShare}%
              </span>
            )}
            <span>
              {t.myReply}: {formatDuration(r.myMedianReply, lang)}
            </span>
            <span>
              {t.theirReply}: {formatDuration(r.theirMedianReply, lang)}
            </span>
            <span>
              {t.streakLongest}: {r.longestStreak} {t.days}
            </span>
            <span>
              {t.lastMessage}: {dateOf(r.last, lang)}
            </span>
          </div>
        </section>
      ))}
      <Promo t={t} campaign="compare" />
    </div>
  );
}

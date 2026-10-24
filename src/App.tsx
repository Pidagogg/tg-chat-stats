import { useEffect, useMemo, useState } from "react";
import { TEXTS, detectLang, type Lang } from "./i18n.ts";
import { compareChats } from "./stats/engine.ts";
import { computeInWorker } from "./stats/run.ts";
import type { ChatData, Stats } from "./stats/types.ts";
import { parseExport } from "./sources/desktopExport.ts";
import { downloadChat, isLoggedIn, listDialogs, logout, telegramConfigured, type DialogInfo } from "./sources/telegram.ts";
import { ChatPicker, type PickItem } from "./ui/ChatPicker.tsx";
import { Login } from "./ui/Login.tsx";
import { CompareView, Promo, StatsView } from "./ui/StatsView.tsx";

type Screen =
  | { kind: "home" }
  | { kind: "login" }
  | { kind: "pick"; source: "telegram" | "export" }
  | { kind: "work"; label: string; count?: number }
  | { kind: "stats"; id: string }
  | { kind: "compare" };

const YEAR = 365 * 86400;

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang());
  const t = TEXTS[lang];
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogs, setDialogs] = useState<DialogInfo[]>([]);
  const [exported, setExported] = useState<ChatData[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  // the analysed chats stay in memory (only on this device) for the word search
  const [chats, setChats] = useState<ChatData[]>([]);
  const [me, setMe] = useState<string | undefined>();
  const [loggedIn, setLoggedIn] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    isLoggedIn().then(setLoggedIn);
  }, []);

  const fail = (err: unknown) => {
    setError(String((err as Error)?.message || err));
    setScreen((s) => (s.kind === "work" ? { kind: "home" } : s));
  };

  const openTelegram = async () => {
    setError("");
    if (!(await isLoggedIn())) return setScreen({ kind: "login" });
    setScreen({ kind: "work", label: t.downloading });
    try {
      setDialogs(await listDialogs());
      setLoggedIn(true);
      setScreen({ kind: "pick", source: "telegram" });
    } catch (err) {
      fail(err);
    }
  };

  const openFile = async (file: File) => {
    setError("");
    setScreen({ kind: "work", label: t.analysing });
    try {
      const chats = parseExport(JSON.parse(await file.text()));
      setExported(chats);
      if (chats.length === 1) return analyse(chats);
      setScreen({ kind: "pick", source: "export" });
    } catch (err) {
      fail(err);
    }
  };

  const analyse = async (chats: ChatData[]) => {
    setScreen({ kind: "work", label: t.analysing });
    const result = await computeInWorker(chats);
    setStats(result);
    setChats(chats);
    setMe(chats.find((c) => c.me)?.me);
    setScreen(result.length === 1 ? { kind: "stats", id: result[0].chat.id } : { kind: "compare" });
  };

  const pick = async (ids: string[], range: "12m" | "all") => {
    try {
      if (screen.kind === "pick" && screen.source === "export") return analyse(exported.filter((c) => ids.includes(c.id)));
      const since = range === "12m" ? Math.floor(Date.now() / 1000) - YEAR : undefined;
      const chats: ChatData[] = [];
      let done = 0;
      for (const id of ids) {
        const d = dialogs.find((x) => x.id === id);
        if (!d) continue;
        chats.push(
          await downloadChat(d, {
            since,
            onProgress: (n) => setScreen({ kind: "work", label: `${t.downloading} ${d.title}`, count: done + n }),
          })
        );
        done += chats.at(-1)!.messages.length;
      }
      await analyse(chats);
    } catch (err) {
      fail(err);
    }
  };

  const wipe = async () => {
    await logout();
    setLoggedIn(false);
    setDialogs([]);
    setExported([]);
    setStats([]);
    setChats([]);
    setScreen({ kind: "home" });
    setNotice(t.loggedOut);
  };

  const pickItems: PickItem[] = useMemo(
    () =>
      screen.kind === "pick" && screen.source === "export"
        ? exported.map((c) => ({ id: c.id, title: c.title, type: c.type, hint: `${c.messages.length}` }))
        : dialogs.map((d) => ({ id: d.id, title: d.title, type: d.type })),
    [screen, exported, dialogs]
  );
  const compareRows = useMemo(() => compareChats(stats, me), [stats, me]);
  const current = screen.kind === "stats" ? stats.find((s) => s.chat.id === screen.id) : undefined;
  const backFromStats = () => setScreen(stats.length > 1 ? { kind: "compare" } : { kind: "home" });

  return (
    <div className="app">
      <header className="top">
        <b>{t.appName}</b>
        <div className="langs">
          {(["en", "ru"] as Lang[]).map((l) => (
            <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="note err" onClick={() => setError("")}>
          {t.errorPrefix} {error}
        </div>
      )}
      {notice && (
        <div className="note ok" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}

      {screen.kind === "home" && (
        <div className="screen">
          <h1>{t.appName}</h1>
          <p>{t.tagline}</p>
          <p className="privacy">
            🔒 {t.privacy}{" "}
            <button className="link" onClick={() => setShowPrivacy((v) => !v)}>
              {t.privacyMore}
            </button>
          </p>
          {showPrivacy && <p className="muted small">{t.privacyDetail}</p>}
          <button className="card action" onClick={openTelegram} disabled={!telegramConfigured()}>
            <b>{t.loginTitle}</b>
            <span>{telegramConfigured() ? t.loginHint : t.notConfigured}</span>
          </button>
          <label className="card action">
            <b>{t.exportTitle}</b>
            <span>{t.exportHint}</span>
            <span className="btn">{t.chooseFile}</span>
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
          </label>
          <Promo t={t} campaign="home" quiet />
        </div>
      )}

      {screen.kind === "login" && (
        <div className="screen">
          <button className="link" onClick={() => setScreen({ kind: "home" })}>
            ← {t.back}
          </button>
          <Login t={t} onDone={openTelegram} onError={setError} />
        </div>
      )}

      {screen.kind === "pick" && (
        <div className="screen">
          <button className="link" onClick={() => setScreen({ kind: "home" })}>
            ← {t.back}
          </button>
          <ChatPicker t={t} items={pickItems} showRange={screen.source === "telegram"} onPick={pick} />
        </div>
      )}

      {screen.kind === "work" && (
        <div className="screen center">
          <div className="spinner" />
          <p>{screen.label}</p>
          {screen.count !== undefined && (
            <p className="muted">
              {screen.count.toLocaleString(lang)} {t.messages}
            </p>
          )}
        </div>
      )}

      {current && <StatsView s={current} chat={chats.find((c) => c.id === current.chat.id)} t={t} lang={lang} onBack={backFromStats} />}
      {screen.kind === "compare" && <CompareView rows={compareRows} t={t} lang={lang} onOpen={(id) => setScreen({ kind: "stats", id })} onBack={() => setScreen({ kind: "home" })} />}

      {loggedIn && (
        <footer className="bottom">
          <button className="link danger" onClick={wipe}>
            {t.logout}
          </button>
        </footer>
      )}
    </div>
  );
}

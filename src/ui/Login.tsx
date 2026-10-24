import { useRef, useState } from "react";
import type { Texts } from "../i18n.ts";
import { loginWithPhone } from "../sources/telegram.ts";

type Step = "phone" | "code" | "password" | "busy";

/**
 * Phone → code → (2FA password). GramJS asks for the code and the password
 * through callbacks; each one waits here for the user's input.
 */
export function Login({ t, onDone, onError }: { t: Texts; onDone: () => void; onError: (msg: string) => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const waiting = useRef<((v: string) => void) | null>(null);

  const ask = (next: Step) =>
    new Promise<string>((resolve) => {
      setValue("");
      setStep(next);
      waiting.current = resolve;
    });

  const start = async () => {
    setStep("busy");
    try {
      await loginWithPhone(phone.trim(), {
        code: () => ask("code"),
        password: (h?: string) => {
          setHint(h || "");
          return ask("password");
        },
        onError: (err) => onError(String(err.message || err)),
      });
      onDone();
    } catch (err) {
      onError(String((err as Error).message || err));
      setStep("phone");
    }
  };

  const submit = () => {
    const resolve = waiting.current;
    waiting.current = null;
    setStep("busy");
    resolve?.(value.trim());
  };

  return (
    <div className="card">
      <h2>{t.loginTitle}</h2>
      {step === "phone" && (
        <>
          <label className="field">
            {t.phone}
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder={t.phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button className="btn primary" onClick={start} disabled={phone.replace(/\D/g, "").length < 7}>
            {t.sendCode}
          </button>
        </>
      )}
      {(step === "code" || step === "password") && (
        <>
          <label className="field">
            {step === "code" ? t.code : t.password}
            <input
              type={step === "code" ? "text" : "password"}
              inputMode={step === "code" ? "numeric" : undefined}
              autoComplete={step === "code" ? "one-time-code" : "current-password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value && submit()}
              autoFocus
            />
          </label>
          {step === "password" && hint && (
            <p className="muted small">
              {t.passwordHint}: {hint}
            </p>
          )}
          <button className="btn primary" onClick={submit} disabled={!value.trim()}>
            {t.confirm}
          </button>
        </>
      )}
      {step === "busy" && <div className="spinner" />}
      <p className="muted small">{t.loginWarning}</p>
    </div>
  );
}

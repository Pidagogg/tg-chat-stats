import { useEffect, useState } from "react";
import type { Texts } from "../i18n.ts";
import type { Delivery } from "../sources/codeDelivery.ts";
import { confirmLoginEmail, passwordHint, requestCode, resendCode, setUpLoginEmail, signIn, signInPassword, type CodeRequest } from "../sources/telegram.ts";

type Step = "phone" | "code" | "setupEmail" | "emailCode" | "password" | "busy";

/** Where the code went, in words — the thing a stuck user needs most. */
function whereTheCodeIs(t: Texts, d: Delivery, phone: string) {
  const text = t.delivery[d.kind] || t.delivery.unknown;
  return text.replace("{phone}", phone).replace("{hint}", d.hint || "").replace("{url}", d.url || "");
}

/**
 * Phone → code (wherever Telegram sent it, with "send it another way") →
 * two-step password when set. When Telegram first demands a login e-mail,
 * that e-mail is set up and confirmed here before the real code comes.
 */
export function Login({ t, onDone, onError }: { t: Texts; onDone: () => void; onError: (msg: string) => void }) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const [req, setReq] = useState<CodeRequest | null>(null);
  const [wait, setWait] = useState(0);

  // the "another way" button unlocks after Telegram's timeout
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const run = async (from: Step, work: () => Promise<void>) => {
    onError(""); // the last attempt's error is stale once the user tries again
    setStep("busy");
    try {
      await work();
    } catch (err) {
      onError(String((err as Error).message || err));
      setStep(from);
    }
  };

  const gotCodeRequest = (r: CodeRequest) => {
    if (r.done) return onDone();
    setReq(r);
    setValue("");
    setWait(r.timeout || 0);
    setStep(r.delivery.kind === "setUpEmail" ? "setupEmail" : "code");
  };

  const toPasswordOrDone = async (result: "done" | "password") => {
    if (result === "done") return onDone();
    setHint(await passwordHint().catch(() => ""));
    setValue("");
    setStep("password");
  };

  const submit = () => {
    if (step === "phone") return run("phone", async () => gotCodeRequest(await requestCode(phone.trim())));
    const v = value.trim();
    if (!v || !req) return;
    if (step === "code") return run("code", async () => toPasswordOrDone(await signIn(req, v)));
    if (step === "setupEmail")
      return run("setupEmail", async () => {
        await setUpLoginEmail(req, v);
        setValue("");
        setStep("emailCode");
      });
    if (step === "emailCode") return run("emailCode", async () => gotCodeRequest(await confirmLoginEmail(req, v)));
    if (step === "password")
      return run("password", async () => {
        await signInPassword(v);
        onDone();
      });
  };

  if (step === "busy") {
    return (
      <div className="card">
        <h2>{t.loginTitle}</h2>
        <div className="spinner" />
      </div>
    );
  }

  const field = {
    phone: [t.phone, "tel", "tel"],
    code: [t.code, "text", "one-time-code"],
    setupEmail: [t.loginEmail, "email", "email"],
    emailCode: [t.loginEmailCode, "text", "one-time-code"],
    password: [t.password, "password", "current-password"],
  } as const;
  const [label, type, autoComplete] = field[step];

  return (
    <div className="card">
      <h2>{t.loginTitle}</h2>
      {step === "code" && req && <p className="note ok">{whereTheCodeIs(t, req.delivery, req.phone)}</p>}
      {step === "setupEmail" && <p className="note ok">{t.delivery.setUpEmail}</p>}
      {step === "emailCode" && <p className="note ok">{t.loginEmailSent}</p>}
      <label className="field">
        {label}
        <input
          type={type}
          inputMode={step === "phone" ? "tel" : step === "code" || step === "emailCode" ? "numeric" : undefined}
          autoComplete={autoComplete}
          placeholder={step === "phone" ? t.phonePlaceholder : undefined}
          value={step === "phone" ? phone : value}
          onChange={(e) => (step === "phone" ? setPhone(e.target.value) : setValue(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus={step !== "phone"}
        />
      </label>
      {step === "password" && hint && (
        <p className="muted small">
          {t.passwordHint}: {hint}
        </p>
      )}
      <button className="btn primary" onClick={submit} disabled={step === "phone" ? phone.replace(/\D/g, "").length < 7 : !value.trim()}>
        {step === "phone" ? t.sendCode : t.confirm}
      </button>
      {step === "code" && req && (
        <button className="link" disabled={wait > 0} onClick={() => run("code", async () => gotCodeRequest(await resendCode(req)))}>
          {(req.next && t.resendAs[req.next]) || t.resendAgain}
          {wait > 0 ? ` (${wait})` : ""}
        </button>
      )}
      {step !== "phone" && (
        <button
          className="link"
          onClick={() => {
            setReq(null);
            setStep("phone");
          }}
        >
          {t.otherNumber}
        </button>
      )}
      <p className="muted small">{t.loginWarning}</p>
    </div>
  );
}

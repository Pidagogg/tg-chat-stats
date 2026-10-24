// Where Telegram sent a login code. Telegram's answer to auth.sendCode names
// the channel (the Telegram app, SMS, a call, the login e-mail, …), and it can
// also refuse to send any code until a login e-mail is set up. GramJS's
// start() hides all of that behind one "enter the code" prompt, so a code
// that went by SMS, or was never sent, looked like a broken login. Pure: it
// reads the TL objects by className, so it is tested without GramJS.

export type DeliveryKind = "app" | "sms" | "call" | "flashCall" | "missedCall" | "email" | "setUpEmail" | "fragment" | "firebase" | "unknown";

export interface Delivery {
  kind: DeliveryKind;
  /** code length, when Telegram says */
  length?: number;
  /** missed call: the number's first digits; e-mail: the masked address */
  hint?: string;
  /** Fragment: where the code can be read */
  url?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deliveryOf(type: any): Delivery {
  const name = String(type?.className || "").replace(/^auth\./, "");
  const length = typeof type?.length === "number" ? type.length : undefined;
  switch (name) {
    case "SentCodeTypeApp":
      return { kind: "app", length };
    case "SentCodeTypeSms":
    case "SentCodeTypeSmsWord":
    case "SentCodeTypeSmsPhrase":
      return { kind: "sms", length };
    case "SentCodeTypeCall":
      return { kind: "call", length };
    case "SentCodeTypeFlashCall":
      return { kind: "flashCall" };
    case "SentCodeTypeMissedCall":
      return { kind: "missedCall", length, hint: type.prefix };
    case "SentCodeTypeEmailCode":
      return { kind: "email", length, hint: type.emailPattern };
    case "SentCodeTypeSetUpEmailRequired":
      return { kind: "setUpEmail" };
    case "SentCodeTypeFragmentSms":
      return { kind: "fragment", length, url: type.url };
    case "SentCodeTypeFirebaseSms":
      // only Telegram's own apps can complete Firebase checks; resending picks another way
      return { kind: "firebase", length };
    default:
      return { kind: "unknown", length };
  }
}

/** The next way Telegram offers (auth.CodeType*), if any — "send it another way". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nextKindOf(nextType: any): DeliveryKind | null {
  const name = String(nextType?.className || "").replace(/^auth\./, "");
  const map: Record<string, DeliveryKind> = {
    CodeTypeSms: "sms",
    CodeTypeCall: "call",
    CodeTypeFlashCall: "flashCall",
    CodeTypeMissedCall: "missedCall",
    CodeTypeFragmentSms: "fragment",
  };
  return map[name] ?? null;
}

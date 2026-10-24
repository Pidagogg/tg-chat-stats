// Where Telegram sent the login code. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryOf, nextKindOf } from "../src/sources/codeDelivery.ts";

test("reads every way Telegram can deliver a login code", () => {
  assert.deepEqual(deliveryOf({ className: "auth.SentCodeTypeApp", length: 5 }), { kind: "app", length: 5 });
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeSms", length: 5 }).kind, "sms");
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeSmsWord" }).kind, "sms");
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeCall", length: 5 }).kind, "call");
  assert.deepEqual(deliveryOf({ className: "auth.SentCodeTypeMissedCall", prefix: "+7 495", length: 4 }), { kind: "missedCall", length: 4, hint: "+7 495" });
  assert.deepEqual(deliveryOf({ className: "auth.SentCodeTypeEmailCode", emailPattern: "a***@gmail.com", length: 6 }), { kind: "email", length: 6, hint: "a***@gmail.com" });
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeSetUpEmailRequired" }).kind, "setUpEmail");
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeFragmentSms", url: "https://fragment.com/x" }).url, "https://fragment.com/x");
  assert.equal(deliveryOf({ className: "auth.SentCodeTypeFirebaseSms" }).kind, "firebase");
  assert.equal(deliveryOf({ className: "auth.SomethingNew" }).kind, "unknown");
  assert.equal(deliveryOf(undefined).kind, "unknown");
});

test("reads the offered fallback for 'send it another way'", () => {
  assert.equal(nextKindOf({ className: "auth.CodeTypeSms" }), "sms");
  assert.equal(nextKindOf({ className: "auth.CodeTypeCall" }), "call");
  assert.equal(nextKindOf(undefined), null);
});

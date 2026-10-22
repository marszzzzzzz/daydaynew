import { useState } from "react";
import { normalizeHkPhone } from "@contracts/onboarding";
import GuidedField from "./GuidedField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactValues = { phone: string; email: string };

/** 第二步：聯絡資料（店主有事搵你、對數用），兩格都可以留空 */
export default function ContactStep({ initial, onChange }: { initial: ContactValues; onChange: (v: ContactValues, valid: boolean) => void }) {
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [focus, setFocus] = useState<"phone" | "email" | null>("phone");

  const phoneOk = normalizeHkPhone(phone);
  const emailOk = email.trim() === "" || EMAIL_RE.test(email.trim());
  const update = (p: string, e: string) => onChange({ phone: p, email: e }, normalizeHkPhone(p) !== null && (e.trim() === "" || EMAIL_RE.test(e.trim())));

  return (
    <div>
      <p className="spec-label">Step 1 — 聯絡資料</p>
      <h2 className="font-display mt-2 text-2xl font-black tracking-tight">店主點樣搵你？</h2>
      <p className="mt-2 text-[13.5px] leading-[1.85] text-ink/65">結數、續租或者貨品有事，店主會用呢度嘅資料聯絡你。只有店主睇到。</p>
      <div className="mt-6 space-y-5">
        <GuidedField
          step={1}
          label="手提電話"
          hint="8 位香港號碼，例如 9123 4567"
          active={focus === "phone"}
          done={!!phoneOk && focus !== "phone"}
          error={phone.trim() && phoneOk === null && focus !== "phone" ? "電話要係 8 位香港號碼" : null}
        >
          <input
            className="underline-input font-mono"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            autoFocus
            onFocus={() => setFocus("phone")}
            onBlur={() => {
              setFocus(null);
              if (phoneOk) setPhone(phoneOk);
            }}
            onChange={(e) => {
              setPhone(e.target.value);
              update(e.target.value, email);
            }}
            placeholder="9123 4567"
          />
        </GuidedField>
        <GuidedField
          step={2}
          label="電郵（可以留空）"
          hint="收月結同通知用"
          active={focus === "email"}
          done={!!email.trim() && emailOk && focus !== "email"}
          error={!emailOk && focus !== "email" ? "電郵格式唔啱，例如 name@gmail.com" : null}
        >
          <input
            className="underline-input font-mono"
            type="email"
            autoComplete="email"
            value={email}
            onFocus={() => setFocus("email")}
            onBlur={() => setFocus(null)}
            onChange={(e) => {
              setEmail(e.target.value);
              update(phone, e.target.value);
            }}
            placeholder="name@gmail.com"
          />
        </GuidedField>
      </div>
    </div>
  );
}

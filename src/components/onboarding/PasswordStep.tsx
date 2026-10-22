import { useState } from "react";
import { passwordChecks } from "@contracts/onboarding";
import GuidedField from "./GuidedField";
import AnimatedCheck from "./AnimatedCheck";

export type PasswordValues = { current: string; next: string };

/** 第三步：將店主俾你嘅臨時密碼改成自己嘅；逐項條件即時打剔 */
export default function PasswordStep({ onChange }: { onChange: (v: PasswordValues, valid: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<"current" | "next" | "confirm" | null>("current");

  const checks = passwordChecks({ current, next, confirm });
  const emit = (c: string, n: string, cf: string) =>
    onChange({ current: c, next: n }, c.length > 0 && passwordChecks({ current: c, next: n, confirm: cf }).every((x) => x.ok));
  const type = show ? "text" : "password";

  return (
    <div>
      <p className="spec-label">Step 2 — 自己嘅密碼</p>
      <h2 className="font-display mt-2 text-2xl font-black tracking-tight">換一個只有你知嘅密碼</h2>
      <p className="mt-2 text-[13.5px] leading-[1.85] text-ink/65">而家用緊嘅密碼係店主幫你開戶時設定嘅。換成自己嘅，銷售資料就只有你睇到。</p>
      <div className="mt-6 space-y-5">
        <GuidedField step={1} label="而家嘅密碼" hint="即係店主俾你、啱啱用嚟登入嗰個" active={focus === "current"} done={current.length > 0 && focus !== "current"}>
          <input
            className="underline-input font-mono"
            type={type}
            autoComplete="current-password"
            autoFocus
            value={current}
            onFocus={() => setFocus("current")}
            onBlur={() => setFocus(null)}
            onChange={(e) => {
              setCurrent(e.target.value);
              emit(e.target.value, next, confirm);
            }}
          />
        </GuidedField>
        <GuidedField step={2} label="新密碼" hint="最少 6 個字，可以混合英文同數字" active={focus === "next"} done={checks[0].ok && checks[1].ok && focus !== "next"}>
          <input
            className="underline-input font-mono"
            type={type}
            autoComplete="new-password"
            value={next}
            onFocus={() => setFocus("next")}
            onBlur={() => setFocus(null)}
            onChange={(e) => {
              setNext(e.target.value);
              emit(current, e.target.value, confirm);
            }}
          />
        </GuidedField>
        <GuidedField step={3} label="再輸入一次新密碼" hint="確認冇打錯" active={focus === "confirm"} done={checks[2].ok && focus !== "confirm"}>
          <input
            className="underline-input font-mono"
            type={type}
            autoComplete="new-password"
            value={confirm}
            onFocus={() => setFocus("confirm")}
            onBlur={() => setFocus(null)}
            onChange={(e) => {
              setConfirm(e.target.value);
              emit(current, next, e.target.value);
            }}
          />
        </GuidedField>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/15 pt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
          {checks.map((c) => (
            <li key={c.key} className={`flex items-center gap-1.5 transition-colors duration-300 ${c.ok ? "text-ink" : "text-ink/40"}`}>
              <span className="flex h-4 w-4 items-center justify-center border border-current">{c.ok && <AnimatedCheck size={11} />}</span>
              {c.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setShow((v) => !v)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ochre-deep underline-offset-4 hover:underline">
          {show ? "隱藏密碼" : "顯示密碼"}
        </button>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import AnimatedCheck from "./AnimatedCheck";

/**
 * 逐步輸入嘅欄位：左邊編號（填好變剔號），正在填嗰格有金色邊同提示。
 * 用喺登入頁同第一次登入引導，令用戶知道「而家填緊邊格、仲差幾多」。
 */
export default function GuidedField({
  step,
  label,
  hint,
  active,
  done,
  error,
  children,
}: {
  step: number;
  label: string;
  hint?: string;
  active: boolean;
  done: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={`relative flex gap-4 transition-opacity duration-300 ${active || done ? "opacity-100" : "opacity-55"}`}>
      <span
        className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center border font-mono text-[11px] transition-colors duration-300 ${
          done ? "border-ink bg-ink text-cream" : active ? "border-ochre-deep bg-ochre/20 text-ink" : "border-ink/30 text-ink/50"
        }`}
        aria-hidden="true"
      >
        {done ? <AnimatedCheck size={14} /> : step}
      </span>
      <label className="block min-w-0 flex-1">
        <span className="spec-label mb-1 flex items-center gap-2">
          {label}
          {active && !done && <span className="ob-pointer text-ochre-deep">←</span>}
        </span>
        {children}
        <span
          className={`block overflow-hidden text-[12px] leading-[1.7] transition-all duration-300 ${
            error ? "max-h-12 pt-1.5 text-red-800" : active && hint ? "max-h-12 pt-1.5 text-ink/55" : "max-h-0"
          }`}
          aria-live="polite"
        >
          {error ?? hint}
        </span>
      </label>
    </div>
  );
}

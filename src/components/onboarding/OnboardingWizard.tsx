import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import WelcomeStep from "./WelcomeStep";
import ContactStep, { type ContactValues } from "./ContactStep";
import PasswordStep, { type PasswordValues } from "./PasswordStep";
import DoneStep from "./DoneStep";

type StepId = "welcome" | "contact" | "password" | "done";

/**
 * 租戶第一次登入引導：歡迎 → 聯絡資料 → 改密碼 → 完成（之後開始聚光燈導覽）。
 * - mode="first"：第一次登入；示範戶口只有歡迎同完成
 * - mode="edit"：之後由「使用教學」入嚟改聯絡資料／密碼
 */
export default function OnboardingWizard({
  mode,
  name,
  grids,
  isDemo,
  contact,
  onTour,
  onClose,
}: {
  mode: "first" | "edit";
  name: string;
  grids: string[];
  isDemo: boolean;
  contact: ContactValues;
  /** 完成後開始導覽 */
  onTour: () => void;
  /** 唔睇導覽直接關閉（first 模式會記錄完成） */
  onClose: (finished: boolean) => void;
}) {
  const steps: StepId[] = mode === "edit" ? ["contact", "password"] : isDemo ? ["welcome", "done"] : ["welcome", "contact", "password", "done"];
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [contactDraft, setContactDraft] = useState<{ v: ContactValues; valid: boolean }>({ v: contact, valid: true });
  const [pwDraft, setPwDraft] = useState<{ v: PasswordValues; valid: boolean }>({ v: { current: "", next: "" }, valid: false });
  const [achieved, setAchieved] = useState<string[]>([]);
  const step = steps[index];

  const utils = trpc.useUtils();
  const saveContact = trpc.shop.updateMyContact.useMutation({ onError: (e) => toast.error(e.message) });
  const changePassword = trpc.account.changePassword.useMutation({ onError: (e) => toast.error(e.message) });
  const busy = saveContact.isPending || changePassword.isPending;

  const go = (delta: 1 | -1) => {
    setDir(delta === 1 ? "next" : "prev");
    if (index + delta >= steps.length) return onClose(true);
    setIndex(index + delta);
  };

  const submitContact = () => {
    const unchanged = contactDraft.v.phone.trim() === contact.phone && contactDraft.v.email.trim() === contact.email;
    if (unchanged) return go(1);
    saveContact.mutate(contactDraft.v, {
      onSuccess: () => {
        setAchieved((a) => [...a, "已更新聯絡資料"]);
        void utils.shop.myItems.invalidate();
        toast.success("聯絡資料已儲存");
        go(1);
      },
    });
  };

  const submitPassword = () =>
    changePassword.mutate(
      { currentPassword: pwDraft.v.current, newPassword: pwDraft.v.next },
      {
        onSuccess: () => {
          setAchieved((a) => [...a, "已改成你自己嘅密碼"]);
          toast.success("密碼已更新，下次用新密碼登入");
          go(1);
        },
      },
    );

  const primary: Record<StepId, { label: string; disabled?: boolean; run: () => void }> = {
    welcome: { label: isDemo ? "帶我睇一圈 →" : "開始設定 →", run: () => go(1) },
    contact: { label: busy ? "儲存中…" : "儲存，下一步 →", disabled: busy || !contactDraft.valid, run: submitContact },
    password: { label: busy ? "更新中…" : "更改密碼 →", disabled: busy || !pwDraft.valid, run: submitPassword },
    done: { label: "帶我睇一圈 →", run: onTour },
  };
  const secondary: Partial<Record<StepId, { label: string; run: () => void }>> = {
    contact: { label: "略過", run: () => go(1) },
    password: { label: mode === "edit" ? "唔改喇" : "下次先改", run: () => go(1) },
    done: { label: "直接開始用", run: () => onClose(true) },
  };
  const p = primary[step];
  const s = secondary[step];

  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-ink/70 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="租戶專區設定">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <div className="ob-rise relative w-full max-w-lg border-2 border-ink bg-cream p-6 text-ink sm:p-9" style={{ boxShadow: "8px 8px 0 0 rgba(179,156,79,1)" }}>
          {/* 進度 */}
          <div className="mb-7 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" aria-hidden="true">
              {steps.map((id, i) => (
                <span key={id} className="h-1 flex-1 overflow-hidden bg-ink/15">
                  <span className="ob-fill block h-full bg-ink" style={{ transform: `scaleX(${i <= index ? 1 : 0})` }} />
                </span>
              ))}
            </div>
            <span className="font-mono text-[11px] text-ink/50">
              {index + 1}/{steps.length}
            </span>
            {step !== "done" && (
              <button onClick={() => onClose(false)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/45 underline-offset-4 hover:underline">
                {mode === "edit" ? "關閉" : "稍後"}
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!p.disabled) p.run();
            }}
          >
            <div key={step} className={dir === "next" ? "ob-step-next" : "ob-step-prev"}>
              {step === "welcome" && <WelcomeStep name={name} grids={grids} isDemo={isDemo} />}
              {step === "contact" && <ContactStep initial={contactDraft.v} onChange={(v, valid) => setContactDraft({ v, valid })} />}
              {step === "password" && <PasswordStep onChange={(v, valid) => setPwDraft({ v, valid })} />}
              {step === "done" && <DoneStep done={achieved} />}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                {index > 0 && step !== "done" && (
                  <button type="button" onClick={() => go(-1)} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/55 hover:text-ink">
                    ← 返回
                  </button>
                )}
                {s && (
                  <button type="button" onClick={s.run} className="text-[13px] text-ink/60 underline-offset-4 hover:underline">
                    {s.label}
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={p.disabled}
                className="bg-ink px-5 py-3 text-[14px] font-semibold text-cream transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ boxShadow: "4px 4px 0 0 rgba(179,156,79,1)" }}
              >
                {p.label}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

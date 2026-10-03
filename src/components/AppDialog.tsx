import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * 頁內確認／輸入對話框，取代瀏覽器嘅 window.confirm / window.prompt。
 * 原因：有啲瀏覽器環境（例如內嵌瀏覽器、部分 WebView）會自動拒絕原生對話框，
 * confirm() 即刻回 false，按鈕就變咗「撳極都冇反應」。
 *
 * 用法：if (await askConfirm("確定刪除？")) …；const v = await askPrompt("新月租", "500")
 */

type Request =
  | { kind: "confirm"; message: string; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; defaultValue: string; inputType: string; confirmLabel: string; resolve: (v: string | null) => void };

let enqueue: ((r: Request) => void) | null = null;

export function askConfirm(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve(window.confirm(message)); // DialogHost 未 mount 時退回原生
    enqueue({ kind: "confirm", message, confirmLabel: opts.confirmLabel ?? "確定", danger: opts.danger ?? false, resolve });
  });
}

export function askPrompt(
  message: string,
  defaultValue = "",
  opts: { confirmLabel?: string; inputType?: "text" | "password" | "number" } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!enqueue) return resolve(window.prompt(message, defaultValue));
    enqueue({ kind: "prompt", message, defaultValue, inputType: opts.inputType ?? "text", confirmLabel: opts.confirmLabel ?? "確定", resolve });
  });
}

/** 喺 App 最外層放一個 */
export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0] ?? null;

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    return () => {
      enqueue = null;
    };
  }, []);

  useEffect(() => {
    if (current?.kind === "prompt") {
      setValue(current.defaultValue);
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [current]);

  const close = (ok: boolean) => {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(ok);
    else current.resolve(ok ? value : null);
    setQueue((q) => q.slice(1));
  };

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => !open && close(false)}>
      {current && (
        <AlertDialogContent className="rounded-none border-2 border-ink bg-cream p-6 shadow-[6px_6px_0_0_rgba(29,29,29,0.9)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg font-black tracking-tight text-ink">
              {current.kind === "confirm" ? "請確認" : "請輸入"}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line text-[14px] leading-[1.8] text-ink/75">
              {current.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {current.kind === "prompt" && (
            <input
              ref={inputRef}
              type={current.inputType}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  close(true);
                }
              }}
              className="w-full border border-ink/40 bg-cream px-3 py-2.5 font-mono text-[14px] outline-none focus:border-ink"
            />
          )}
          <AlertDialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => close(false)}
              className="border border-ink/40 px-4 py-2 font-mono text-[12.5px] transition-colors hover:bg-ink/5"
            >
              取消
            </button>
            <button
              type="button"
              autoFocus={current.kind === "confirm"}
              onClick={() => close(true)}
              className={`px-4 py-2 font-mono text-[12.5px] text-cream transition-transform hover:-translate-y-0.5 ${
                current.kind === "confirm" && current.danger ? "bg-red-800" : "bg-ink"
              }`}
            >
              {current.confirmLabel}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}

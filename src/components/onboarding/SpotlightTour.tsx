import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeCard, spotlightRect, type CardPlacement, type Rect } from "@/lib/tourPlacement";

export type TourStep = {
  /** 對應頁面上 data-tour="…" 嘅元素；搵唔到就自動跳過 */
  target: string;
  title: string;
  body: string;
};

const SPOT_PADDING = 10;
const CARD_WIDTH = 340;
const CARD_FALLBACK_HEIGHT = 220;

const findTarget = (id: string) => document.querySelector<HTMLElement>(`[data-tour="${id}"]`);

function sameRect(a: Rect | null, b: Rect) {
  return !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/**
 * 聚光燈導覽：畫面變暗，只照亮當前目標，說明卡跟住目標移動。
 * - 每格 frame 量一次目標位置（捲動、改視窗大小、內容載入都會跟住）
 * - ← → 鍵切換，Esc 略過；系統「減少動態效果」時冇過渡動畫
 */
export default function SpotlightTour({ steps, onFinish, onSkip }: { steps: TourStep[]; onFinish: () => void; onSkip: () => void }) {
  const live = steps.filter((s) => findTarget(s.target));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<CardPlacement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = live[index];
  const isLast = index === live.length - 1;

  // 換步：將目標捲到畫面中間
  useEffect(() => {
    if (!step) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    findTarget(step.target)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    primaryRef.current?.focus({ preventScroll: true });
  }, [step]);

  // 持續量度目標同說明卡位置
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const measure = () => {
      const el = findTarget(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const next = spotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height }, SPOT_PADDING);
        setRect((prev) => (sameRect(prev, next) ? prev : next));
        const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
        const height = cardRef.current?.offsetHeight ?? CARD_FALLBACK_HEIGHT;
        const pos = placeCard(next, { width, height }, { width: window.innerWidth, height: window.innerHeight });
        setCardPos((prev) => (prev && prev.top === pos.top && prev.left === pos.left ? prev : pos));
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const next = useCallback(() => (isLast ? onFinish() : setIndex((i) => i + 1)), [isLast, onFinish]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onSkip]);

  // 頁面上一個目標都冇（例如資料未載入）就直接當完成
  useEffect(() => {
    if (live.length === 0) onFinish();
  }, [live.length, onFinish]);

  if (!step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {/* 擋住頁面操作；聚光燈本身用大陰影整暗其餘地方 */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          className="ob-spotlight pointer-events-none absolute rounded-[3px]"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgba(29, 29, 29, 0.72)" }}
        >
          <div className="ob-ring absolute inset-0 rounded-[3px] border-2 border-ochre" />
        </div>
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="ob-card absolute border-2 border-ink bg-cream p-5 text-ink"
        style={{
          width: Math.min(CARD_WIDTH, window.innerWidth - 24),
          top: cardPos?.top ?? -9999,
          left: cardPos?.left ?? 0,
          opacity: cardPos ? 1 : 0,
          boxShadow: "6px 6px 0 0 rgba(179,156,79,1)",
        }}
      >
        <div key={index} className="ob-rise">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ochre-deep">
              {String(index + 1).padStart(2, "0")} / {String(live.length).padStart(2, "0")}
            </p>
            <div className="flex gap-1" aria-hidden="true">
              {live.map((s, i) => (
                <span key={s.target} className={`h-1.5 transition-all duration-300 ${i === index ? "w-5 bg-ink" : i < index ? "w-1.5 bg-ochre" : "w-1.5 bg-ink/20"}`} />
              ))}
            </div>
          </div>
          <h3 id="tour-title" className="font-display mt-3 text-xl font-black tracking-tight">
            {step.title}
          </h3>
          <p className="mt-2 text-[13.5px] leading-[1.85] text-ink/75">{step.body}</p>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={onSkip} className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink/50 underline-offset-4 hover:underline">
            略過導覽
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={prev} className="border border-ink/40 px-3.5 py-2 text-[13px] transition-colors hover:bg-ink hover:text-cream">
                上一步
              </button>
            )}
            <button ref={primaryRef} onClick={next} className="bg-ink px-4 py-2 text-[13px] font-semibold text-cream transition-transform hover:-translate-y-0.5">
              {isLast ? "明白，開始用" : "下一步 →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

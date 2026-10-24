import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import BannerCard from "./BannerCard";

const DISMISS_KEY = "gridbox:banner-dismissed";
/** 等頁面主要內容出咗先滑入，唔好同首屏搶注意力 */
const ENTER_DELAY_MS = 900;
const EXIT_MS = 240;

function readDismissed(): number | null {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * 網站「最新宣傳」浮動橫幅：手機貼住畫面底部、大畫面喺右下角，延遲滑入。
 * 訪客撳 × 會記住當時嘅版本；店主改咗內容（版本變）就會再顯示。
 */
export default function PromoBanner() {
  const { data: banner } = trpc.banner.current.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const visible = !!banner && dismissed !== banner.version;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setShown(true), ENTER_DELAY_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!banner || !visible) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => {
      try {
        localStorage.setItem(DISMISS_KEY, String(banner.version));
      } catch {
        /* 私隱模式寫唔到：今次閂咗，下次再見到 */
      }
      setDismissed(banner.version);
    }, EXIT_MS);
  };

  const on = shown && !closing;
  return (
    <aside
      aria-label="最新宣傳"
      className="fixed inset-x-3 bottom-3 z-40 transition-[transform,opacity] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(540px,calc(100vw-48px))]"
      style={{
        transform: on ? "translateY(0)" : "translateY(calc(100% + 32px))",
        opacity: on ? 1 : 0,
        transitionDuration: closing ? `${EXIT_MS}ms` : "520ms",
        pointerEvents: on ? "auto" : "none",
      }}
    >
      <BannerCard banner={banner} onClose={close} />
    </aside>
  );
}

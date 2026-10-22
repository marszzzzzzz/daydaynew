import { useEffect, useRef, useState } from "react";

/** 版頭「使用教學」：重睇導覽、改聯絡資料／密碼 */
export default function HelpMenu({ onTour, onEdit }: { onTour: () => void; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "block w-full px-4 py-2.5 text-left text-[13.5px] transition-colors hover:bg-ochre/15";
  return (
    <div ref={ref} className="relative" data-tour="help">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="使用教學"
        className="flex items-center gap-1.5 whitespace-nowrap border border-ink/45 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-cream"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">?</span>
        <span className="hidden sm:inline">使用教學</span>
      </button>
      {open && (
        <div className="ob-rise absolute right-0 top-full z-50 mt-2 w-56 border-2 border-ink bg-cream py-1" style={{ boxShadow: "4px 4px 0 0 rgba(179,156,79,1)" }}>
          <button className={item} onClick={() => (setOpen(false), onTour())}>
            重睇導覽
          </button>
          {onEdit && (
            <button className={item} onClick={() => (setOpen(false), onEdit())}>
              改聯絡資料／密碼
            </button>
          )}
        </div>
      )}
    </div>
  );
}

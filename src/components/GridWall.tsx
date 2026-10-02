import { useState } from "react";
import { cn } from "@/lib/utils";
import { GRID_SIZE_LABEL, GRID_STATUS_LABEL } from "@/lib/format";

export type WallGrid = {
  code: string;
  size: string;
  status: string;
  monthlyRent: string;
};

/**
 * 格仔牆 — 宣傳頁主角。真實格仔狀態：招租 / 已租出 / 已預留。
 * hover 時彈出規格 tooltip；stagger 入場動畫。
 */
export default function GridWall({ grids }: { grids: WallGrid[] }) {
  const [active, setActive] = useState<string | null>(null);

  if (!grids.length) {
    return <GridWallSkeleton />;
  }

  return (
    <div className="relative max-sm:[overflow-x:clip] max-sm:[overflow-clip-margin:12px]">
      {/* 規格框：虛線 + 角標 */}
      <div className="absolute -inset-3 border border-dashed border-ink/40 pointer-events-none" aria-hidden="true" />
      <CornerMark className="-top-3 -left-3 border-t-2 border-l-2" />
      <CornerMark className="-top-3 -right-3 border-t-2 border-r-2" />
      <CornerMark className="-bottom-3 -left-3 border-b-2 border-l-2" />
      <CornerMark className="-bottom-3 -right-3 border-b-2 border-r-2" />

      <div className="grid grid-cols-5 gap-[3px] sm:grid-cols-7">
        {grids.map((g, i) => {
          const isActive = active === g.code;
          return (
            <button
              key={g.code}
              type="button"
              onMouseEnter={() => setActive(g.code)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(g.code)}
              onBlur={() => setActive(null)}
              className={cn(
                "grid-cell animate-cell-in text-left",
                g.status === "occupied" && "grid-cell-occupied",
                g.status === "vacant" && "grid-cell-vacant",
                g.status === "reserved" && "bg-ochre/15",
                isActive && "border-ink z-10",
              )}
              style={{ animationDelay: `${Math.min(i * 14, 900)}ms` }}
            >
              <span className="absolute left-1 top-1 font-mono text-[9px] leading-none tracking-wide text-ink/70">
                {g.code}
              </span>
              {g.status === "vacant" ? (
                <span className="absolute inset-x-1 bottom-1 font-mono text-[8px] uppercase tracking-[0.18em] text-ochre-deep">
                  招租
                </span>
              ) : (
                <span
                  className={cn(
                    "absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full",
                    g.status === "occupied" ? "bg-ink" : "bg-ochre-deep",
                  )}
                />
              )}

              {/* 規格 tooltip：只喺 hover 時先出現（隱藏時唔佔位，避免手機版頁面被撐闊） */}
              {isActive && (
                <span
                  className={cn(
                    "pointer-events-none absolute -top-2 z-20 -translate-y-full whitespace-nowrap border border-ink bg-ink px-2 py-1 font-mono text-[10px] text-cream",
                    tipAlign(i % 5, 5),
                    tipAlignSm(i % 7, 7),
                  )}
                >
                  {g.code} · {GRID_SIZE_LABEL[g.size] ?? g.size} · {GRID_STATUS_LABEL[g.status] ?? g.status}
                  {g.status === "vacant" && ` · $${Number(g.monthlyRent).toFixed(0)}/月`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CornerMark({ className }: { className: string }) {
  return <div className={cn("absolute h-3 w-3 border-ink", className)} aria-hidden="true" />;
}

function GridWallSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-[3px] sm:grid-cols-7">
      {Array.from({ length: 70 }).map((_, i) => (
        <div
          key={i}
          className="grid-cell grid-cell-vacant animate-cell-in"
          style={{ animationDelay: `${Math.min(i * 14, 900)}ms` }}
        />
      ))}
    </div>
  );
}

/** tooltip 對齊：左邊兩行靠左、右邊兩行靠右、中間置中（避免超出畫面） */
function tipAlign(col: number, cols: number) {
  if (col <= 1) return "left-0";
  if (col >= cols - 2) return "right-0";
  return "left-1/2 -translate-x-1/2";
}
function tipAlignSm(col: number, cols: number) {
  if (col <= 1) return "sm:left-0 sm:right-auto sm:translate-x-0";
  if (col >= cols - 2) return "sm:left-auto sm:right-0 sm:translate-x-0";
  return "sm:left-1/2 sm:right-auto sm:-translate-x-1/2";
}

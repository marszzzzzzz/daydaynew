import { useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/router";
import { trpc } from "@/providers/trpc";
import { LATEST_SHOWN, publicName } from "@contracts/products";
import { SectionTitle } from "../../ui";
import ProductEditor from "./ProductEditor";

export type ProductListRow = inferRouterOutputs<AppRouter>["products"]["list"]["rows"][number];
type Filter = "all" | "todo" | "latest" | "bestSeller" | "hidden";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "todo", label: "未完成 SEO" },
  { id: "bestSeller", label: "熱銷" },
  { id: "latest", label: "最新" },
  { id: "hidden", label: "隱藏" },
];

function Thumb({ row }: { row: ProductListRow }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden border border-ink/20 bg-ochre/15">
      {row.imageUrl ? (
        <img src={row.imageUrl} alt="" width={48} height={48} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center font-display text-lg font-black text-ochre-deep/70">{[...publicName(row)][0]}</span>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="w-20 shrink-0" title={`SEO 分數 ${score}`}>
      <p className="text-right font-mono text-[11px] text-ink/60">SEO {score}</p>
      <div className="mt-1 h-1 bg-ink/10">
        <div className={`h-full ${score === 100 ? "bg-ink" : "bg-ochre"}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function HomeRow({ title, count, how, onClick }: { title: string; count: number; how: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex-1 p-4 text-left transition-colors hover:bg-ochre/10 sm:p-5">
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className={`font-mono text-[12px] ${count ? "text-ink" : "text-ochre-deep"}`}>{count ? `${count} 件` : "未有貨品"}</span>
      </p>
      <p className="mt-1 text-[12.5px] leading-[1.75] text-ink/60">{how}</p>
    </button>
  );
}

/** 首頁兩行點樣嚟：上行 Facebook、下行店主揀；兩行都冇貨就唔顯示 */
function HomeRows({ latest, bestSeller, onPick }: { latest: number; bestSeller: number; onPick: (f: Filter) => void }) {
  return (
    <div className="mb-10 border-2 border-ink">
      <p className="border-b border-ink/15 px-4 py-2.5 text-[12.5px] text-ink/65 sm:px-5">
        首頁商品輪播：有貨品就自動出現，唔使開任何開關。<a href="/#products" target="_blank" rel="noopener" className="text-ochre-deep underline-offset-2 hover:underline">去首頁睇 ↗</a>
      </p>
      <div className="flex flex-col divide-y divide-ink/15 sm:flex-row sm:divide-x sm:divide-y-0">
        <HomeRow title="上行：最新商品" count={latest} onClick={() => onPick("latest")} how={`喺後台 15「Facebook 消息」將新貨帖「轉做商品」就會加入，最新嘅排最前（首頁顯示最近 ${LATEST_SHOWN} 件）。都可以喺下面逐件剔。`} />
        <HomeRow title="下行：熱銷產品" count={bestSeller} onClick={() => onPick("bestSeller")} how="喺下面逐件撳「編輯」→ 剔「放入首頁熱銷產品」。列表按 POS 銷量排，賣得最多嘅喺最頂；揀「熱銷」篩選可以用 ↑ ↓ 調次序。" />
      </div>
    </div>
  );
}

/** 14 商品 SEO：首頁兩行商品 + 逐件貨改對外名稱、描述、關鍵字、相片 */
export default function ProductsTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const list = trpc.products.list.useQuery({ filter, search }, { placeholderData: (prev) => prev });
  const reorder = trpc.products.reorderBestSellers.useMutation({
    onSuccess: () => void utils.products.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const rows = list.data?.rows ?? [];

  const move = (index: number, delta: -1 | 1) => {
    const names = rows.map((r) => r.sourceName);
    const target = index + delta;
    if (target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target], names[index]];
    reorder.mutate({ sourceNames: names });
  };

  return (
    <div>
      <SectionTitle
        no="14 · Products & SEO"
        title="商品 SEO"
        desc="幫貨品改一個客人搜得到嘅名、寫一兩句描述同關鍵字，Google 同 AI 搜尋（ChatGPT、Perplexity）都會讀到。對外名稱只用喺首頁同搜尋，唔會改到銷售記錄。"
      />
      <HomeRows latest={list.data?.counts.latest ?? 0} bestSeller={list.data?.counts.bestSeller ?? 0} onPick={setFilter} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="篩選貨品">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`border px-3 py-1.5 font-mono text-[11.5px] transition-colors ${filter === f.id ? "border-ink bg-ink text-cream" : "border-ink/30 hover:border-ink"}`}
            >
              {f.label} {list.data ? list.data.counts[f.id] : ""}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="w-full border border-ink/30 bg-cream px-3 py-2 text-[13.5px] outline-none focus:border-ink sm:w-64"
          placeholder="搜尋貨品名、關鍵字"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="搜尋貨品"
        />
      </div>

      {filter === "bestSeller" && rows.length > 1 && <p className="mb-3 text-[12.5px] text-ink/55">用 ↑ ↓ 調整首頁熱銷產品嘅次序（由左至右）。</p>}
      {filter === "latest" && rows.length > LATEST_SHOWN && <p className="mb-3 text-[12.5px] text-ink/55">首頁只顯示最頂 {LATEST_SHOWN} 件，下面嘅已經退落嚟。</p>}

      <ul className="border-b border-ink/15">
        {rows.map((r, i) => (
          <li key={r.sourceName} className="border-t border-ink/15 py-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <Thumb row={r} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{publicName(r)}</p>
                <p className="truncate font-mono text-[11px] text-ink/50">
                  {r.displayName ? `POS：${r.sourceName}` : "未設定對外名稱"} · 售出 {r.qty} 件{r.price ? ` · HK$${Number(r.price).toFixed(0)}` : ""}
                </p>
              </div>
              {r.latest && <span className="badge-frame hidden border border-ochre-deep font-mono text-[10.5px] text-ochre-deep sm:inline">最新</span>}
              {r.bestSeller && <span className="badge-frame hidden border border-ochre-deep font-mono text-[10.5px] text-ochre-deep sm:inline">熱銷</span>}
              {r.hidden && <span className="badge-frame hidden border border-ink/30 font-mono text-[10.5px] text-ink/50 sm:inline">隱藏</span>}
              <ScoreBar score={r.score} />
              {filter === "bestSeller" && (
                <div className="flex gap-1">
                  <button aria-label={`${publicName(r)} 向前`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="h-8 w-8 border border-ink/30 text-[13px] transition-colors hover:bg-ink hover:text-cream disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink">
                    ↑
                  </button>
                  <button aria-label={`${publicName(r)} 向後`} disabled={i === rows.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="h-8 w-8 border border-ink/30 text-[13px] transition-colors hover:bg-ink hover:text-cream disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink">
                    ↓
                  </button>
                </div>
              )}
              <button
                onClick={() => setEditing(editing === r.sourceName ? null : r.sourceName)}
                className="shrink-0 border border-ink/40 px-3 py-1.5 font-mono text-[11px] transition-colors hover:bg-ink hover:text-cream"
                aria-expanded={editing === r.sourceName}
              >
                {editing === r.sourceName ? "收起" : "編輯"}
              </button>
            </div>
            {editing === r.sourceName && (
              <div className="mt-4">
                <ProductEditor row={r} onClose={() => setEditing(null)} />
              </div>
            )}
          </li>
        ))}
        {list.data && rows.length === 0 && (
          <li className="py-14 text-center text-ink/45">{search ? "搵唔到符合嘅貨品" : filter === "all" ? "未有銷售記錄。匯入 POS 銷售之後，貨品會自動喺呢度出現。" : "呢個分類未有貨品"}</li>
        )}
      </ul>
      {list.data && list.data.total > rows.length && (
        <p className="mt-3 font-mono text-[11px] text-ink/45">
          顯示 {rows.length} / {list.data.total} 件（按銷量排）。用搜尋搵其他貨品。
        </p>
      )}
    </div>
  );
}

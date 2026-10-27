import { useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/router";
import { trpc } from "@/providers/trpc";
import { publicName } from "@contracts/products";
import { SectionTitle } from "../../ui";
import ShowcaseSettings from "./ShowcaseSettings";
import ProductEditor from "./ProductEditor";

export type ProductListRow = inferRouterOutputs<AppRouter>["products"]["list"]["rows"][number];
type Filter = "all" | "todo" | "featured" | "hidden";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "todo", label: "未完成 SEO" },
  { id: "featured", label: "精選" },
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

/** 14 商品 SEO：首頁輪播設定 + 逐件貨改對外名稱、描述、關鍵字、相片 */
export default function ProductsTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const list = trpc.products.list.useQuery({ filter, search }, { placeholderData: (prev) => prev });
  const reorder = trpc.products.reorderFeatured.useMutation({
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
      <ShowcaseSettings />

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

      {filter === "featured" && rows.length > 1 && <p className="mb-3 text-[12.5px] text-ink/55">用 ↑ ↓ 調整首頁精選商品嘅次序（由左至右）。</p>}

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
              {r.featured && <span className="badge-frame hidden border border-ochre-deep font-mono text-[10.5px] text-ochre-deep sm:inline">精選</span>}
              {r.hidden && <span className="badge-frame hidden border border-ink/30 font-mono text-[10.5px] text-ink/50 sm:inline">隱藏</span>}
              <ScoreBar score={r.score} />
              {filter === "featured" && (
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

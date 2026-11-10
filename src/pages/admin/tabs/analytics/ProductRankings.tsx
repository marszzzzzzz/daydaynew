import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { fmtMoney, todayStr } from "@/lib/format";
import { RANKING_PERIODS, rankingRange, type RankingPeriod } from "@/lib/rankingRange";
import RankRow from "./RankRow";

/** 同走勢圖用同一套範圍篩選 */
export type RankingFilter = { scope: "all" | "grids" | "direct"; tenantId?: number; gridCode?: string };

const TOP_SHOWN = 10;
const TOP_SHOWN_MAX = 30;
const CATEGORY_SHOWN = 3;
const panelCls = "border border-ink/20 bg-cream p-4 sm:p-5";

const without = (set: ReadonlySet<string>, key: string) => new Set([...set].filter((k) => k !== key));
const withKey = (set: ReadonlySet<string>, key: string) => new Set([...set, key]);

/**
 * 12 銷售分析 · 貨品排行：
 * 1. 銷量最多嘅貨品（按件數）
 * 2. 各類別入面最好賣嘅貨品（類別由店主喺 14 商品 SEO 設定；未設定嘅歸「未分類」）
 */
export default function ProductRankings({ filter, sales }: { filter: RankingFilter; sales: { first: string | null; last: string | null } }) {
  const [period, setPeriod] = useState<RankingPeriod>("3m");
  const [showMore, setShowMore] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { from, to } = rankingRange(period, sales, todayStr());
  const q = trpc.shop.admin.productRanking.useQuery(
    { from, to, scope: filter.scope, tenantId: filter.tenantId, gridCode: filter.gridCode || undefined },
    { placeholderData: (prev) => prev },
  );
  const d = q.data;

  const top = d ? d.topByQty.slice(0, showMore ? TOP_SHOWN_MAX : TOP_SHOWN) : [];
  const topMax = d?.topByQty[0]?.qty ?? 0;
  const hasRealCategory = !!d?.categories.some((c) => !c.uncategorized);

  return (
    <section className="mt-14" aria-labelledby="ranking-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ranking-title" className="font-display text-xl font-black tracking-tight">貨品排行</h2>
          {d && (
            <p className="mt-1 font-mono text-[11.5px] text-ink/55">
              {d.from} 至 {d.to} · {d.productCount} 款貨品 · {d.totalQty} 件 · ${fmtMoney(d.totalAmount)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap border border-ink/30" role="tablist" aria-label="統計期間">
          {RANKING_PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 font-mono text-[12px] transition-colors ${period === p.id ? "bg-ink text-cream" : "hover:bg-ink/5"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {q.error ? (
        <p className="mt-6 text-[13px] text-red-800">排行載入唔到：{q.error.message}</p>
      ) : !d ? (
        <p className="mt-6 text-center text-[13px] text-ink/45">載入中…</p>
      ) : d.productCount === 0 ? (
        <p className="mt-6 text-center text-[13px] text-ink/45">呢段期間未有銷售</p>
      ) : (
        <>
          <div className={`mt-5 ${panelCls}`}>
            <h3 className="text-[14px] font-semibold">銷量最多嘅貨品</h3>
            <p className="mt-0.5 text-[12px] text-ink/55">按賣出嘅件數排；件數一樣就睇銷售額。</p>
            <ol className="mt-3">
              {top.map((p, i) => (
                <RankRow key={p.name} rank={i + 1} name={p.name} qty={p.qty} amount={p.amount} max={topMax} category={p.category.trim() || undefined} />
              ))}
            </ol>
            {d.topByQty.length > TOP_SHOWN && (
              <button onClick={() => setShowMore(!showMore)} className="mt-2 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline">
                {showMore ? `只顯示頭 ${TOP_SHOWN} 款` : `顯示頭 ${Math.min(d.topByQty.length, TOP_SHOWN_MAX)} 款`}
              </button>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-[14px] font-semibold">各類別最好賣嘅貨品</h3>
            <p className="mt-0.5 text-[12px] text-ink/55">
              類別係你喺「14 商品 SEO」每件貨揀嘅「類別」；未揀嘅歸入「未分類」。
            </p>
            {!hasRealCategory && (
              <p className="mt-3 border border-ochre/60 bg-ochre/10 px-3 py-2 text-[12.5px] leading-[1.8]">
                暫時未有貨品設定類別，所以全部喺「未分類」。去「14 商品 SEO」撳貨品嘅「編輯」，填「類別」（例如：衣物、袋、文具），呢度就會按類別分開排。
              </p>
            )}
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {d.categories.map((c) => {
                const open = expanded.has(c.category);
                const shown = open ? c.top : c.top.slice(0, CATEGORY_SHOWN);
                const share = d.totalQty > 0 ? Math.round((c.qty / d.totalQty) * 100) : 0;
                return (
                  <div key={c.category} className={panelCls}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h4 className="text-[14px] font-semibold">{c.category}</h4>
                      <span className="font-mono text-[12px] text-ink/60">
                        {c.qty} 件 · ${fmtMoney(c.amount)} · 佔 {share}%
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-ink/45">{c.productCount} 款貨品</p>
                    <ol className="mt-2">
                      {shown.map((p, i) => (
                        <RankRow key={p.name} rank={i + 1} name={p.name} qty={p.qty} amount={p.amount} max={c.top[0]?.qty ?? 0} />
                      ))}
                    </ol>
                    {c.top.length > CATEGORY_SHOWN && (
                      <button
                        onClick={() => setExpanded(open ? without(expanded, c.category) : withKey(expanded, c.category))}
                        className="mt-2 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline"
                      >
                        {open ? `只顯示頭 ${CATEGORY_SHOWN} 款` : `顯示頭 ${c.top.length} 款${c.productCount > c.top.length ? `（共 ${c.productCount} 款）` : ""}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

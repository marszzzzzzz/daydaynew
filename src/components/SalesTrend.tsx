import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/providers/trpc";
import { fmtMoney, todayStr } from "@/lib/format";

/**
 * 租戶專區走勢圖：
 * - 總銷售：柱狀（每個時段一條柱）
 * - 頭 5 位貨品：折線（5 色，已用 dataviz validator 驗證：CVD ΔE ≥ 9.1、正常視覺 ΔE ≥ 19.6）
 * - 日／週／月切換；撳柱或者下面時段列表 → 睇嗰段時間嘅貨品；可以再「細睇」落一級（月 → 週 → 日）
 */

type G = "day" | "week" | "month";
const G_LABEL: Record<G, string> = { day: "日", week: "週", month: "月" };
const FINER: Record<G, G | null> = { month: "week", week: "day", day: null };

/**
 * 類別色（固定次序，validator 驗證：CVD ΔE ≥ 9.1、正常視覺 ΔE ≥ 19.6）。
 * 顏色跟住「貨品」，唔跟排名：同一件貨喺唔同時段／下鑽都係同一隻色。
 * 喺米色底上部分顏色對比度唔夠 3:1，所以一定有圖例 + 時段列表做文字版。
 */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const INK = "#1D1D1D";
const GRID = "#E3E0C8";
const MUTED = "#6B6A5E";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(s + "T00:00:00Z");

/** 預設「最近」期間：以 anchor（最近有銷售嘅日子或者今日）為終點 */
function recentRange(g: G, anchor: string) {
  const end = day(anchor);
  const start = new Date(end);
  if (g === "day") start.setUTCDate(start.getUTCDate() - 29);
  else if (g === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * 11);
  } else {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 11);
  }
  return { from: iso(start), to: anchor };
}

/** 軸刻度：$500、$3.5k、$10.5k（最多 1 個小數位，唔四捨五入成誤導嘅整數） */
const compact = (v: number) => (v >= 1000 ? `$${Number((v / 1000).toFixed(1))}k` : `$${v}`);

type Crumb = { g: G; from: string; to: string; label: string };

/** 資料來源：租戶專區（只限自己）或者店主全店分析 */
export type TrendSource =
  | { kind: "tenant"; gridCode: string }
  | { kind: "shop"; scope: "all" | "grids" | "direct"; tenantId?: number; gridCode?: string };

const ITEM_LIMIT = 30;

export default function SalesTrend({
  source,
  latestMonth,
  title = "銷售走勢",
}: {
  source: TrendSource;
  latestMonth: string | null;
  title?: string;
}) {
  // 「最近」以最後一個有銷售嘅月份月尾為準（POS 資料未必去到今日）
  const anchor = useMemo(() => {
    const today = todayStr();
    if (!latestMonth) return today;
    const end = day(latestMonth + "-01");
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const e = iso(end);
    return e < today ? e : today;
  }, [latestMonth]);

  const [g, setG] = useState<G>("month");
  const [range, setRange] = useState(() => recentRange("month", anchor));
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const base = { granularity: g, from: range.from, to: range.to };
  const tenantQ = trpc.shop.myTrend.useQuery(
    { ...base, gridCode: source.kind === "tenant" ? source.gridCode || undefined : undefined },
    { enabled: source.kind === "tenant", placeholderData: (prev) => prev },
  );
  const shopQ = trpc.shop.admin.shopTrend.useQuery(
    source.kind === "shop"
      ? { ...base, scope: source.scope, tenantId: source.tenantId, gridCode: source.gridCode || undefined }
      : { ...base },
    { enabled: source.kind === "shop", placeholderData: (prev) => prev },
  );
  const q = source.kind === "shop" ? shopQ : tenantQ;
  const d = q.data ?? undefined;
  const isShop = source.kind === "shop";
  const [showAllItems, setShowAllItems] = useState<string | null>(null);

  // 貨品 → 顏色：第一次見到嘅貨品攞下一隻未用嘅色，之後一直跟住佢（切換日／週／月或者下鑽都唔會變色）
  const colorOf = useRef(new Map<string, string>());
  const colors = useMemo(() => {
    const map = colorOf.current;
    for (const p of d?.topProducts ?? []) {
      if (map.has(p.name)) continue;
      const used = new Set(map.values());
      const free = SERIES.find((c) => !used.has(c));
      if (free) map.set(p.name, free);
      else {
        // 8 隻色用晒：借用而家冇顯示緊嘅貨品嘅色
        const showing = new Set((d?.topProducts ?? []).map((x) => x.name));
        const victim = [...map.keys()].find((k) => !showing.has(k));
        if (victim) {
          map.set(p.name, map.get(victim)!);
          map.delete(victim);
        }
      }
    }
    return (d?.topProducts ?? []).map((p) => map.get(p.name) ?? SERIES[0]);
  }, [d]);

  const switchG = (next: G) => {
    setG(next);
    setRange(recentRange(next, anchor));
    setCrumbs([]);
    setSelected(null);
  };

  const drill = (b: { key: string; from: string; to: string; label: string }) => {
    const finer = FINER[g];
    if (!finer) return;
    setCrumbs([...crumbs, { g, from: range.from, to: range.to, label: b.label }]);
    setG(finer);
    setRange({ from: b.from, to: b.to });
    setSelected(null);
  };

  const back = () => {
    const last = crumbs[crumbs.length - 1];
    if (!last) return;
    setCrumbs(crumbs.slice(0, -1));
    setG(last.g);
    setRange({ from: last.from, to: last.to });
    setSelected(null);
  };

  const chartData = (d?.buckets ?? []).map((b) => ({
    key: b.key,
    label: b.label,
    amount: b.amount,
    qty: b.qty,
    ...Object.fromEntries(b.top.map((v, i) => [`p${i}`, v])),
  }));
  const sel = d?.buckets.find((b) => b.key === selected) ?? null;
  const listed = (d?.buckets ?? []).filter((b) => showEmpty || b.amount > 0).slice().reverse();
  const emptyCount = (d?.buckets ?? []).filter((b) => b.amount === 0).length;

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black tracking-tight">{title}</h2>
          {d && (
            <p className="mt-1 font-mono text-[11.5px] text-ink/55">
              {d.from} 至 {d.to} · 共 ${fmtMoney(d.totalAmount)} · {d.totalQty} 件
            </p>
          )}
        </div>
        {/* 時段粒度：一行過，喺圖之上 */}
        <div className="flex border border-ink/30" role="tablist" aria-label="時段">
          {(["day", "week", "month"] as G[]).map((x) => (
            <button
              key={x}
              role="tab"
              aria-selected={g === x}
              onClick={() => switchG(x)}
              className={`px-4 py-1.5 font-mono text-[12.5px] transition-colors ${g === x ? "bg-ink text-cream" : "hover:bg-ink/5"}`}
            >
              {G_LABEL[x]}
            </button>
          ))}
        </div>
      </div>

      {crumbs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[12px]">
          <button onClick={back} className="border border-ink/40 px-2.5 py-1 hover:bg-ink hover:text-cream">
            ← 返回
          </button>
          <span className="text-ink/55">
            {crumbs.map((c) => c.label).join(" › ")} › 按{G_LABEL[g]}
          </span>
        </div>
      )}

      {/* 圖 1：總銷售（柱） */}
      <div className="mt-5 border border-ink/20 bg-cream p-3 sm:p-4">
        <p className="mb-2 text-[12.5px] text-ink/70">總銷售（每{G_LABEL[g]}）</p>
        <div className="h-[200px] sm:h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10.5, fill: MUTED }} tickLine={false} axisLine={false} width={44} />
              <Tooltip cursor={{ fill: "rgba(29,29,29,0.06)" }} content={<RevenueTip />} />
              <Bar
                dataKey="amount"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                onClick={(p: { key?: string; payload?: { key: string } }) => {
                  const k = p.payload?.key ?? p.key;
                  if (k) setSelected(k === selected ? null : k);
                }}
                style={{ cursor: "pointer" }}
              >
                {chartData.map((c) => (
                  <Cell key={c.key} fill={INK} fillOpacity={selected && selected !== c.key ? 0.3 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 圖 2：頭 5 位貨品（線） */}
      <div className="mt-4 border border-ink/20 bg-cream p-3 sm:p-4">
        <p className="mb-2 text-[12.5px] text-ink/70">頭 5 位貨品銷售額（期間內排名）</p>
        {d && d.topProducts.length > 0 ? (
          <>
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink/80">
              {d.topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center gap-1.5">
                  <span className="inline-block h-[3px] w-4 rounded" style={{ background: colors[i] }} aria-hidden />
                  <span className="max-w-[11rem] truncate">{p.name}</span>
                  <span className="font-mono text-ink/50">${fmtMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="h-[200px] sm:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                  <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 10.5, fill: MUTED }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ stroke: MUTED, strokeWidth: 1 }} content={<ProductTip names={d.topProducts.map((p) => p.name)} colors={colors} />} />
                  {d.topProducts.map((p, i) => (
                    <Line
                      key={p.name}
                      type="linear"
                      dataKey={`p${i}`}
                      name={p.name}
                      stroke={colors[i]}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      dot={{ r: 4, strokeWidth: 2, stroke: "#F8F7E5", fill: colors[i] }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#F8F7E5" }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-[13px] text-ink/45">{q.isLoading ? "載入中…" : "呢段期間未有銷售"}</p>
        )}
      </div>

      {/* 時段列表（下鑽） */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">時段列表</p>
        {emptyCount > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-ink/60">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            顯示冇銷售嘅時段（{emptyCount}）
          </label>
        )}
      </div>
      <div className="mt-2 border border-ink/25">
        {listed.map((b) => {
          const open = selected === b.key;
          return (
            <div key={b.key} className="border-b border-ink/10 last:border-b-0">
              <button
                onClick={() => setSelected(open ? null : b.key)}
                aria-expanded={open}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ochre/10 ${open ? "bg-ochre/10" : ""}`}
              >
                <span className="w-4 font-mono text-[11px] text-ink/45">{open ? "▾" : "▸"}</span>
                <span className="min-w-[5.5rem] font-mono text-[13px]">{b.label}</span>
                <span className="hidden flex-1 truncate text-[12px] text-ink/55 sm:block">
                  {isShop && b.amount > 0
                    ? `格仔 $${fmtMoney(b.gridAmount)} · 直銷 $${fmtMoney(b.directAmount)}`
                    : b.items[0]
                      ? `最好賣：${b.items[0].name}`
                      : ""}
                </span>
                <span className="ml-auto font-mono text-[12px] text-ink/55">{b.qty} 件</span>
                <span className="w-24 text-right font-mono text-[13.5px] font-semibold">${fmtMoney(b.amount)}</span>
              </button>
              {open && (
                <div className="bg-cream-2/40 px-4 pb-4 pt-1">
                  {b.items.length === 0 ? (
                    <p className="py-3 text-[12.5px] text-ink/50">呢個時段冇銷售</p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <tbody>
                        {(showAllItems === b.key ? b.items : b.items.slice(0, ITEM_LIMIT)).map((it) => (
                          <tr key={it.name} className="border-b border-ink/10 last:border-b-0">
                            <td className="py-1.5 pr-3">{it.name}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right font-mono text-ink/60">× {it.qty}</td>
                            <td className="whitespace-nowrap py-1.5 text-right font-mono font-semibold">${fmtMoney(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {b.items.length > ITEM_LIMIT && (
                    <button
                      onClick={() => setShowAllItems(showAllItems === b.key ? null : b.key)}
                      className="mt-2 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline"
                    >
                      {showAllItems === b.key ? "只顯示頭 30 款" : `顯示全部 ${b.items.length} 款貨品`}
                    </button>
                  )}
                  {FINER[g] && b.amount > 0 && (
                    <button onClick={() => drill(b)} className="mt-3 border border-ink px-3 py-1.5 font-mono text-[12px] hover:bg-ink hover:text-cream">
                      按{G_LABEL[FINER[g]!]}細睇 {b.label} →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {listed.length === 0 && <p className="py-10 text-center text-[13px] text-ink/45">{q.isLoading ? "載入中…" : "呢段期間未有銷售"}</p>}
      </div>
      {sel && <p className="mt-2 font-mono text-[11px] text-ink/45">已揀：{sel.label}（{sel.from} 至 {sel.to}）</p>}
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink/45">
        撳柱或者時段可以睇嗰段時間賣咗咩；POS 資料按匯入日期記帳，所以一個月嘅銷售可能集中喺同一日。
      </p>
    </section>
  );
}

type TipProps = { active?: boolean; label?: string; payload?: { value: number; payload: { qty: number } ; dataKey?: string; color?: string }[] };

function RevenueTip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="border border-ink bg-cream px-3 py-2 font-mono text-[12px] shadow-[3px_3px_0_0_rgba(29,29,29,0.85)]">
      <p className="text-ink/60">{label}</p>
      <p className="font-semibold">${fmtMoney(p.value)}</p>
      <p className="text-ink/60">{p.payload.qty} 件</p>
    </div>
  );
}

function ProductTip({ active, label, payload, names, colors }: TipProps & { names: string[]; colors: string[] }) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .map((p) => ({ i: Number(String(p.dataKey).slice(1)), v: p.value }))
    .sort((a, b) => b.v - a.v);
  return (
    <div className="max-w-[16rem] border border-ink bg-cream px-3 py-2 text-[12px] shadow-[3px_3px_0_0_rgba(29,29,29,0.85)]">
      <p className="mb-1 font-mono text-ink/60">{label}</p>
      {rows.map((r) => (
        <p key={r.i} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colors[r.i] }} aria-hidden />
          <span className="flex-1 truncate">{names[r.i]}</span>
          <span className="font-mono">${fmtMoney(r.v)}</span>
        </p>
      ))}
    </div>
  );
}

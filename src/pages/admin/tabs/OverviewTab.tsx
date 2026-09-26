import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";
import { SectionTitle, ActionButton } from "../ui";

export default function OverviewTab({ goTab }: { goTab: (t: "sales" | "rent" | "leases" | "grids") => void }) {
  const stats = trpc.shop.admin.stats.useQuery();
  const recent = trpc.shop.admin.listSales.useQuery({});

  if (stats.isLoading) {
    return <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-ink/50">載入中…</p>;
  }
  const s = stats.data;
  const occupancy = s && s.grids.total > 0 ? Math.round((s.grids.occupied / s.grids.total) * 100) : 0;

  return (
    <div>
      <SectionTitle no="01 · Overview" title="全店總覽" desc={`數據即時讀取 · 銷售統計以 ${s?.month ?? ""} 月份計算。`} />

      {/* 四組明示數據 */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatGroup
          label="Sales this month"
          title="本月銷售"
          desc={`${s?.month} 全部格仔嘅售出紀錄`}
          stats={[
            { label: "銷售額（HKD）", value: `$${fmtMoney(s?.sales.amount)}`, strong: true },
            { label: "售出件數", value: `${s?.sales.qty ?? 0} 件` },
            { label: "成交筆數", value: `${s?.sales.count ?? 0} 筆` },
          ]}
        />
        <StatGroup
          label="Grid occupancy"
          title="格仔狀況"
          desc="全店格仔嘅即時租用狀態"
          stats={[
            { label: "出租率（已租出 ÷ 總數）", value: `${occupancy}%`, strong: true },
            { label: "已租出", value: `${s?.grids.occupied ?? 0} 格` },
            { label: "招租中 / 已預留", value: `${s?.grids.vacant ?? 0} / ${s?.grids.reserved ?? 0} 格` },
            { label: "格仔總數", value: `${s?.grids.total ?? 0} 格` },
          ]}
        />
        <StatGroup
          label="Leases"
          title="租約概況"
          desc="生效中租約及到期提醒"
          stats={[
            { label: "生效中租約", value: `${s?.leases.active ?? 0} 份`, strong: true },
            { label: "30 日內到期", value: `${s?.leases.expiring30 ?? 0} 份`, warn: (s?.leases.expiring30 ?? 0) > 0 },
            { label: "登記租戶", value: `${s?.tenants.total ?? 0} 位` },
          ]}
        />
        <StatGroup
          label="Rent & deposit"
          title="租金按金"
          desc="未收嘅租金同按金記錄"
          stats={[
            { label: "未收筆數", value: `${s?.rent.unpaidCount ?? 0} 筆`, strong: true, warn: (s?.rent.unpaidCount ?? 0) > 0 },
            { label: "未收金額（HKD）", value: `$${fmtMoney(s?.rent.unpaidAmount)}` },
          ]}
        />
      </div>

      {/* 快捷操作 */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="spec-label mr-2">快捷操作 —</span>
        <ActionButton tone="ochre" onClick={() => goTab("sales")}>+ 記錄今日銷售</ActionButton>
        <ActionButton tone="ghost" onClick={() => goTab("rent")}>開立本月租金單</ActionButton>
        <ActionButton tone="ghost" onClick={() => goTab("leases")}>新增租約</ActionButton>
        <ActionButton tone="ghost" onClick={() => goTab("grids")}>管理格仔</ActionButton>
      </div>

      {/* 最新銷售 */}
      <div className="mt-14 flex items-baseline justify-between">
        <div>
          <p className="spec-label">Recent sales</p>
          <h3 className="font-display mt-1.5 text-xl font-black tracking-tight">最新銷售（最近 8 筆）</h3>
        </div>
        <button onClick={() => goTab("sales")} className="font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline">
          睇全部 →
        </button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="ledger-table w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">日期</th>
              <th className="py-3 pr-4">格仔</th>
              <th className="py-3 pr-4">租戶</th>
              <th className="py-3 pr-4">貨品</th>
              <th className="py-3 pr-4 text-right">數量</th>
              <th className="py-3 text-right">金額（HKD）</th>
            </tr>
          </thead>
          <tbody>
            {(recent.data ?? []).slice(0, 8).map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-ochre/10">
                <td className="py-3 pr-4 font-mono text-[12.5px]">{r.saleDate}</td>
                <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{r.gridCode}</td>
                <td className="py-3 pr-4">{r.tenantName}</td>
                <td className="py-3 pr-4">{r.productName}</td>
                <td className="py-3 pr-4 text-right font-mono">{r.quantity}</td>
                <td className="py-3 text-right font-mono font-semibold">${fmtMoney(r.totalAmount)}</td>
              </tr>
            ))}
            {(recent.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-14 text-center text-ink/45">未有銷售記錄</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatGroup({
  label,
  title,
  desc,
  stats,
}: {
  label: string;
  title: string;
  desc: string;
  stats: { label: string; value: string; strong?: boolean; warn?: boolean }[];
}) {
  return (
    <section className="border border-ink/25">
      <header className="border-b border-ink/15 px-6 py-4">
        <p className="spec-label">{label}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-black tracking-tight">{title}</h3>
          <p className="text-[11.5px] text-ink/50">{desc}</p>
        </div>
      </header>
      <dl className="divide-y divide-ink/10">
        {stats.map((st) => (
          <div key={st.label} className="flex items-baseline justify-between px-6 py-3.5">
            <dt className="text-[12.5px] text-ink/60">{st.label}</dt>
            <dd
              className={`font-mono tracking-tight ${
                st.strong ? "text-xl font-semibold" : "text-[15px]"
              } ${st.warn ? "text-tang" : "text-ink"}`}
            >
              {st.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

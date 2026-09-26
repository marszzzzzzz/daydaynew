import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import DashHeader from "@/components/DashHeader";
import { fmtMoney, currentMonthStr } from "@/lib/format";

export default function TenantDashboard() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [month, setMonth] = useState<string>("");

  const summary = trpc.shop.mySummary.useQuery(undefined, { enabled: !!user });
  const sales = trpc.shop.mySales.useQuery(
    { month: month || undefined },
    { enabled: !!user && !!summary.data },
  );

  if (isLoading || summary.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink/50">載入中…</p>
      </div>
    );
  }

  // 未連結租戶檔案
  if (!summary.data) {
    return (
      <div className="min-h-screen bg-cream text-ink">
        <DashHeader roleLabel="租客 Tenant · 唯讀銷售記錄" />
        <main className="mx-auto max-w-2xl px-5 py-24 text-center">
          <p className="font-display text-6xl font-black text-ochre">!</p>
          <h1 className="font-display mt-6 text-3xl font-black tracking-tight">戶口未連結租戶檔案</h1>
          <p className="mt-5 text-[14.5px] leading-[1.9] text-ink/70">
            你嘅登入戶口仲未連結到任何租戶檔案。請聯絡店主，喺 Admin 後台嘅「租戶管理」
            將你嘅戶口（{user?.name ?? user?.email}）連結到你嘅租戶檔案，之後就可以睇返銷售記錄。
          </p>
        </main>
      </div>
    );
  }

  const { tenant, stats } = summary.data;
  const rows = sales.data ?? [];

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashHeader roleLabel="租客 Tenant · 唯讀銷售記錄" />

      <main className="mx-auto max-w-6xl px-5 py-12">
        {/* 抬頭 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="spec-label">Tenant — 租戶專區</p>
            <h1 className="font-display mt-2 text-4xl font-black tracking-tight">{tenant.name}</h1>
          </div>
          {stats.activeLeases.length > 0 && (
            <div className="flex gap-2">
              {stats.activeLeases.map((l) => (
                <span key={l.id} className="badge-frame border border-ink/40 text-ink/75">
                  格仔 {l.gridCode} · 租至 {l.endDate}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 統計 */}
        <div className="mt-10 grid grid-cols-2 border border-ink/25 md:grid-cols-4 md:divide-x md:divide-ink/15">
          <StatCell label={`${stats.month} 銷售額`} value={`$${fmtMoney(stats.monthAmount)}`} />
          <StatCell label="本月售出" value={`${stats.monthQty} 件`} />
          <StatCell label="累計銷售額" value={`$${fmtMoney(stats.totalAmount)}`} />
          <StatCell label="累計售出" value={`${stats.totalQty} 件`} />
        </div>

        {/* 銷售記錄 */}
        <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-black tracking-tight">銷售記錄</h2>
          <label className="flex items-center gap-3 font-mono text-[12px] text-ink/60">
            月份
            <input
              type="month"
              value={month}
              max={currentMonthStr()}
              onChange={(e) => setMonth(e.target.value)}
              className="underline-input !w-auto font-mono"
            />
            {month && (
              <button onClick={() => setMonth("")} className="text-ochre-deep underline-offset-2 hover:underline">
                清除
              </button>
            )}
          </label>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="ledger-table w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="text-left">
                <th className="py-3 pr-4">日期</th>
                <th className="py-3 pr-4">格仔</th>
                <th className="py-3 pr-4">貨品</th>
                <th className="py-3 pr-4 text-right">數量</th>
                <th className="py-3 pr-4 text-right">單價</th>
                <th className="py-3 pr-4 text-right">金額</th>
                <th className="py-3">備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-ochre/10">
                  <td className="py-3 pr-4 font-mono text-[12.5px]">{r.saleDate}{r.saleTime ? ` ${r.saleTime}` : ""}</td>
                  <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{r.gridCode}</td>
                  <td className="py-3 pr-4">{r.productName}</td>
                  <td className="py-3 pr-4 text-right font-mono">{r.quantity}</td>
                  <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.unitPrice)}</td>
                  <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(r.totalAmount)}</td>
                  <td className="py-3 text-ink/55">{r.note ?? ""}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-ink/45">
                    {sales.isLoading ? "載入中…" : "呢段時間未有銷售記錄"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/45">
          租戶戶口為唯讀：只可以查看自己格仔嘅銷售數據 · 所有記錄由店主匯入及管理 · 如有出入請聯絡店舖
        </p>
      </main>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-7">
      <p className="font-mono text-2xl font-semibold tracking-tight md:text-[28px]">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-ink/60">{label}</p>
    </div>
  );
}

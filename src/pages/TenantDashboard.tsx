import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import DashHeader from "@/components/DashHeader";
import { fmtMoney } from "@/lib/format";

/** 租戶專區（唯讀）：只顯示總銷售同按貨品合計 */
export default function TenantDashboard() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const [month, setMonth] = useState<string>("");
  const data = trpc.shop.myItems.useQuery({ month: month || undefined }, { enabled: !!user, placeholderData: (prev) => prev });

  if (isLoading || (data.isLoading && !data.data)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink/50">載入中…</p>
      </div>
    );
  }

  // 未連結租戶檔案
  if (!data.data) {
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

  const d = data.data;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <DashHeader roleLabel="租客 Tenant · 唯讀銷售記錄" />

      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="spec-label">Tenant — 租戶專區</p>
        <h1 className="font-display mt-2 text-3xl font-black tracking-tight sm:text-4xl">{d.tenant.name}</h1>
        {d.grids.length > 0 && <p className="mt-2 font-mono text-[12.5px] text-ink/60">格仔 {d.grids.join(" · ")}</p>}

        {/* 期間 */}
        <div className="mt-8 flex items-center gap-3">
          <span className="font-mono text-[12px] text-ink/60">期間</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-ink/30 bg-cream px-3 py-2 font-mono text-[13.5px] outline-none focus:border-ink"
          >
            <option value="">全部</option>
            {d.months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* 總銷售 */}
        <div className="mt-6 border-2 border-ink p-6 sm:p-8">
          <p className="text-[13px] text-ink/60">{month ? `${month} 總銷售` : "累計總銷售"}</p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-tight sm:text-5xl">${fmtMoney(d.totalAmount)}</p>
          <p className="mt-2 font-mono text-[13px] text-ink/60">
            共售出 {d.totalQty} 件 · {d.items.length} 款貨品
          </p>
        </div>

        {/* 貨品 */}
        <h2 className="font-display mt-12 text-xl font-black tracking-tight">貨品銷售</h2>
        <div className="mt-4 overflow-x-auto border border-ink/25">
          <table className="ledger-table w-full text-[14px]">
            <thead>
              <tr className="text-left">
                <th className="py-3 pl-5 pr-4">貨品</th>
                <th className="py-3 pr-4 text-right">數量</th>
                <th className="py-3 pr-5 text-right">銷售額</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.name}>
                  <td className="py-3 pl-5 pr-4">{it.name}</td>
                  <td className="py-3 pr-4 text-right font-mono">{it.qty}</td>
                  <td className="py-3 pr-5 text-right font-mono font-semibold">${fmtMoney(it.amount)}</td>
                </tr>
              ))}
              {d.items.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-14 text-center text-ink/45">
                    呢段時間未有銷售記錄
                  </td>
                </tr>
              )}
            </tbody>
            {d.items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink font-semibold">
                  <td className="py-3 pl-5 pr-4">合計</td>
                  <td className="py-3 pr-4 text-right font-mono">{d.totalQty}</td>
                  <td className="py-3 pr-5 text-right font-mono">${fmtMoney(d.totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="mt-6 font-mono text-[11px] leading-[1.8] tracking-[0.08em] text-ink/45">
          唯讀：只顯示你格仔嘅銷售 · 所有記錄由店舖匯入 · 如有出入請聯絡店舖
        </p>
      </main>
    </div>
  );
}

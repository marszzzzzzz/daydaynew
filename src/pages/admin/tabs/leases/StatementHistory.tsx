import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";
import { EmptyRow } from "../../ui";

const when = (d: Date | string) => new Date(d).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", hour12: false, dateStyle: "short", timeStyle: "short" });

/** 已確認月結單：每個租戶每月 payback 總數；揀租戶篩選，撳「睇」跳去嗰張 */
export default function StatementHistory({
  tenants,
  tenantId,
  onTenant,
  onOpen,
}: {
  tenants: { id: number; name: string }[];
  tenantId: number | "";
  onTenant: (id: number | "") => void;
  onOpen: (tenantId: number, month: string) => void;
}) {
  const list = trpc.shop.admin.listStatements.useQuery({ tenantId: tenantId === "" ? undefined : tenantId });
  const rows = list.data ?? [];
  const totalPayback = rows.reduce((n, r) => n + Math.round(Number(r.totalPayback) * 100), 0) / 100;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">已確認月結單</h3>
          <p className="mt-0.5 text-[12px] text-ink/55">每個租戶每月 payback 總數。</p>
        </div>
        <select className="border border-ink/30 bg-cream px-3 py-2 text-[13px]" value={tenantId} onChange={(e) => onTenant(e.target.value ? Number(e.target.value) : "")} aria-label="篩選租戶">
          <option value="">全部租戶</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="ledger-table w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">月份</th>
              <th className="py-3 pr-4">租戶</th>
              <th className="py-3 pr-4 text-right">銷售</th>
              <th className="py-3 pr-4 text-right">Payroll</th>
              <th className="py-3 pr-4 text-right">租金</th>
              <th className="py-3 pr-4 text-right">Payback</th>
              <th className="py-3 pr-4">確認時間</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-ochre/10">
                <td className="py-3 pr-4 font-mono text-[12.5px]">{r.month}</td>
                <td className="py-3 pr-4">{r.tenantName}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.totalSales)}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.totalPayroll)}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(r.totalRent)}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold">${fmtMoney(r.totalPayback)}</td>
                <td className="py-3 pr-4 font-mono text-[12px] text-ink/55">{when(r.confirmedAt)}</td>
                <td className="py-3 text-right">
                  <button onClick={() => onOpen(r.tenantId, r.month)} className="px-2 py-1 font-mono text-[11.5px] text-ochre-deep underline-offset-2 hover:underline">
                    睇
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={8} text={list.isLoading ? "載入中…" : "未有已確認嘅月結單"} />}
            {rows.length > 0 && (
              <tr className="border-t-2 border-ink font-semibold">
                <td className="py-3 pr-4" colSpan={5}>
                  {tenantId === "" ? "全部租戶" : tenants.find((t) => t.id === tenantId)?.name} 累計 Payback（{rows.length} 張）
                </td>
                <td className="py-3 pr-4 text-right font-mono text-[15px]">${fmtMoney(totalPayback)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

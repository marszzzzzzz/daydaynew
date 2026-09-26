import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { fmtMoney } from "@/lib/format";

/** 今個星期一（YYYY-MM-DD） */
function thisMonday(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 週結報表（店主＋店員共用）：星期一至日，逐日＋逐格仔＋店舖直銷 */
export default function WeeklyReport() {
  const [weekStart, setWeekStart] = useState(thisMonday());
  const report = trpc.shop.admin.weeklyReport.useQuery({ weekStart });
  const r = report.data;

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => shiftWeek(-1)} className="border border-ink/30 px-3 py-1.5 font-mono text-[12.5px] transition-colors hover:bg-ink hover:text-cream">
          ← 上一週
        </button>
        <p className="font-mono text-[14px] font-semibold">
          {r ? `${r.weekStart} 至 ${r.weekEnd}` : weekStart}
        </p>
        <button onClick={() => shiftWeek(1)} className="border border-ink/30 px-3 py-1.5 font-mono text-[12.5px] transition-colors hover:bg-ink hover:text-cream">
          下一週 →
        </button>
        <button onClick={() => setWeekStart(thisMonday())} className="font-mono text-[12px] text-ochre-deep underline-offset-2 hover:underline">
          返今週
        </button>
      </div>

      {report.isLoading && <p className="mt-8 font-mono text-[12px] text-ink/50">載入中…</p>}

      {r && (
        <>
          {/* 總結 */}
          <div className="mt-6 grid grid-cols-2 border border-ink/25 md:grid-cols-4 md:divide-x md:divide-ink/15">
            <Stat label="全週銷售額" value={`$${fmtMoney(r.grand.amount)}`} />
            <Stat label="全週售出" value={`${r.grand.qty} 件`} />
            <Stat label="交易筆數" value={`${r.grand.count}`} />
            <Stat label="店舖直銷" value={`$${fmtMoney(r.direct.amount)}`} sub={`${r.direct.count} 筆`} />
          </div>

          {/* 逐格仔 */}
          <h4 className="font-display mt-10 mb-4 text-lg font-black tracking-tight">逐格仔結算</h4>
          <div className="overflow-x-auto border border-ink/25">
            <table className="ledger-table w-full min-w-[560px] text-[13.5px]">
              <thead>
                <tr className="text-left">
                  <th className="py-3 pl-5 pr-4">格仔</th>
                  <th className="py-3 pr-4">租戶</th>
                  <th className="py-3 pr-4 text-right">筆數</th>
                  <th className="py-3 pr-4 text-right">售出件數</th>
                  <th className="py-3 pr-5 text-right">銷售額</th>
                </tr>
              </thead>
              <tbody>
                {r.byGrid.map((g) => (
                  <tr key={g.gridCode} className="transition-colors hover:bg-ochre/10">
                    <td className="py-3 pl-5 pr-4 font-mono text-[12.5px] font-semibold">{g.gridCode}</td>
                    <td className="py-3 pr-4">{g.tenantName ?? "—"}</td>
                    <td className="py-3 pr-4 text-right font-mono">{g.count}</td>
                    <td className="py-3 pr-4 text-right font-mono">{g.qty}</td>
                    <td className="py-3 pr-5 text-right font-mono font-semibold">${fmtMoney(g.amount)}</td>
                  </tr>
                ))}
                {r.direct.count > 0 && (
                  <tr className="bg-ink/[0.03] transition-colors hover:bg-ochre/10">
                    <td className="py-3 pl-5 pr-4 font-mono text-[12.5px] font-semibold">—</td>
                    <td className="py-3 pr-4 text-ink/70">店舖直銷</td>
                    <td className="py-3 pr-4 text-right font-mono">{r.direct.count}</td>
                    <td className="py-3 pr-4 text-right font-mono">{r.direct.qty}</td>
                    <td className="py-3 pr-5 text-right font-mono font-semibold">${fmtMoney(r.direct.amount)}</td>
                  </tr>
                )}
                {r.byGrid.length === 0 && r.direct.count === 0 && (
                  <tr><td colSpan={5} className="py-10 text-center text-ink/45">呢個星期未有銷售記錄</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 逐日 */}
          <h4 className="font-display mt-10 mb-4 text-lg font-black tracking-tight">逐日走勢</h4>
          <div className="overflow-x-auto border border-ink/25">
            <table className="ledger-table w-full min-w-[480px] text-[13.5px]">
              <thead>
                <tr className="text-left">
                  <th className="py-3 pl-5 pr-4">日期</th>
                  <th className="py-3 pr-4 text-right">筆數</th>
                  <th className="py-3 pr-4 text-right">售出件數</th>
                  <th className="py-3 pr-5 text-right">銷售額</th>
                </tr>
              </thead>
              <tbody>
                {r.byDay.map((d) => (
                  <tr key={d.date} className="transition-colors hover:bg-ochre/10">
                    <td className="py-3 pl-5 pr-4 font-mono text-[12.5px]">{d.date}</td>
                    <td className="py-3 pr-4 text-right font-mono">{d.count}</td>
                    <td className="py-3 pr-4 text-right font-mono">{d.qty}</td>
                    <td className="py-3 pr-5 text-right font-mono font-semibold">${fmtMoney(d.amount)}</td>
                  </tr>
                ))}
                {r.byDay.length === 0 && (
                  <tr><td colSpan={4} className="py-10 text-center text-ink/45">未有數據</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-6 py-6">
      <p className="font-mono text-xl font-semibold tracking-tight md:text-2xl">{value}</p>
      <p className="mt-1 text-[12.5px] text-ink/60">{label}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}

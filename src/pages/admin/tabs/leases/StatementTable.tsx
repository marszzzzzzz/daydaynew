import { fmtMoney } from "@/lib/format";
import type { RentMonthState } from "@contracts/leaseRent";
import type { StatementLine, StatementTotals } from "@contracts/statement";

const RENT_STATE: Record<StatementLine["rentState"], string> = {
  paid: "租金已收",
  unpaid: "租金未收",
  missing: "租金未開單",
  free: "免租",
  none: "冇租約",
};

const num = "py-3 pr-4 text-right font-mono";

/** 月結單明細：逐格銷售、payroll、租金、payback，最後一行合計 */
export default function StatementTable({ lines, totals, payrollRate }: { lines: StatementLine[]; totals: StatementTotals; payrollRate: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger-table w-full min-w-[640px] text-[13.5px]">
        <thead>
          <tr className="text-left">
            <th className="py-3 pr-4">格仔</th>
            <th className="py-3 pr-4 text-right">銷售</th>
            <th className="py-3 pr-4 text-right">Payroll（銷售 × {payrollRate}%）</th>
            <th className="py-3 pr-4 text-right">租金</th>
            <th className="py-3 text-right">Payback</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.gridId} className="transition-colors hover:bg-ochre/10">
              <td className="py-3 pr-4 font-mono text-[12.5px] font-semibold">{l.gridCode}</td>
              <td className={num}>${fmtMoney(l.sales)}</td>
              <td className={num}>${fmtMoney(l.payroll)}</td>
              <td className={num}>
                ${fmtMoney(l.rent)}
                <span className="block text-[10.5px] text-ink/45">{RENT_STATE[l.rentState as RentMonthState | "none"]}</span>
              </td>
              <td className="py-3 text-right font-mono font-semibold">${fmtMoney(l.payback)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink font-semibold">
            <td className="py-3 pr-4">合計</td>
            <td className={num}>${fmtMoney(totals.sales)}</td>
            <td className={num}>${fmtMoney(totals.payroll)}</td>
            <td className={num}>${fmtMoney(totals.rent)}</td>
            <td className="py-3 text-right font-mono text-[15px]">${fmtMoney(totals.payback)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

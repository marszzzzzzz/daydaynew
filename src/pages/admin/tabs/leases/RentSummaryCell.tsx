import { fmtMoney } from "@/lib/format";
import type { RentSummary } from "@contracts/leaseRent";

/** 租約列表入面嘅「租金確認」一格：已確認幾多個月、到期未收、已收總額 */
export default function RentSummaryCell({ summary }: { summary: RentSummary | undefined }) {
  if (!summary) return <span className="text-ink/35">—</span>;
  const { confirmedMonths, collectableMonths, overdueMonths, overdueAmount, confirmedAmount, freeMonths } = summary;
  return (
    <div className="font-mono text-[12.5px] leading-[1.7]">
      <div>
        <b className="text-[14px]">{confirmedMonths}</b> / {collectableMonths} 個月 <span className="text-ink/50">已確認</span>
      </div>
      {overdueMonths > 0 && (
        <div className="text-tang">
          到期未收 {overdueMonths} 個月 · ${fmtMoney(overdueAmount)}
        </div>
      )}
      <div className="text-[11.5px] text-ink/50">
        已收 ${fmtMoney(confirmedAmount)}
        {freeMonths > 0 && ` · 免租 ${freeMonths} 個月`}
      </div>
    </div>
  );
}

import { fmtMoney } from "@/lib/format";

/** 一行排行：名次、貨品名、類別、相對長度嘅棒、件數同銷售額。棒淨係視覺輔助，數字都有文字版。 */
export default function RankRow({
  rank,
  name,
  qty,
  amount,
  max,
  category,
}: {
  rank: number;
  name: string;
  qty: number;
  amount: number;
  /** 呢組入面最高嘅件數（棒嘅 100%） */
  max: number;
  category?: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((qty / max) * 100)) : 0;
  return (
    <li className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-x-3 gap-y-1 border-b border-ink/10 py-2.5 last:border-b-0">
      <span className="font-mono text-[12px] text-ink/45">{rank}</span>
      <span className="min-w-0 text-[13.5px]">
        <span className="break-words">{name}</span>
        {category && <span className="ml-2 whitespace-nowrap border border-ink/25 px-1.5 py-0.5 font-mono text-[10.5px] text-ink/60">{category}</span>}
      </span>
      <span className="whitespace-nowrap text-right font-mono text-[12.5px]">
        <b className="text-[14px]">{qty}</b> 件<span className="ml-3 text-ink/55">${fmtMoney(amount)}</span>
      </span>
      <span aria-hidden className="col-start-2 col-end-4 block h-[5px] bg-ink/10">
        <span className="block h-full bg-ink/80" style={{ width: `${width}%` }} />
      </span>
    </li>
  );
}

export type RankingPeriod = "1m" | "3m" | "12m" | "all";

export const RANKING_PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: "1m", label: "最新一個月" },
  { id: "3m", label: "最近 3 個月" },
  { id: "12m", label: "最近 12 個月" },
  { id: "all", label: "全部" },
];

const MONTHS: Record<Exclude<RankingPeriod, "all">, number> = { "1m": 1, "3m": 3, "12m": 12 };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 排行榜嘅統計期間：以最後一個有銷售嘅月份為準（POS 資料未必去到今日），
 * 揀「最近 N 個月」就係嗰個月連同前面 N-1 個月；終點唔會遲過今日，起點唔會早過第一筆銷售。
 */
export function rankingRange(
  period: RankingPeriod,
  sales: { first: string | null; last: string | null },
  today: string,
): { from: string; to: string } {
  const anchorMonth = new Date((sales.last ?? today).slice(0, 7) + "-01T00:00:00Z");
  const monthEnd = new Date(anchorMonth);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  const to = iso(monthEnd) < today ? iso(monthEnd) : today;

  if (period === "all") return { from: sales.first ?? iso(anchorMonth), to };

  const start = new Date(anchorMonth);
  start.setUTCMonth(start.getUTCMonth() - (MONTHS[period] - 1));
  const from = iso(start);
  return { from: sales.first && from < sales.first ? sales.first : from, to };
}

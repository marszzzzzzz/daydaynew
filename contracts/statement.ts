import { z } from "zod";
import { buildRentSchedule, type LeaseLite, type RentMonthState, type RentRecordLite } from "./leaseRent";

/**
 * 租戶月結單：揀租戶同月份，逐格列出該月銷售、payroll、租金、payback。
 * - payroll = 該格該月銷售 × 比例（而家 100%，自動計）
 * - payback（每月俾返租客）= 該格該月銷售；租金只係列出，唔喺 payback 度扣
 * 純函數，前後端共用，方便測試。
 */

/** payroll 佔銷售額嘅百分比（確認月結單時會連同數字一齊存低，之後改呢個值唔會影響舊月結單） */
export const PAYROLL_RATE_PERCENT = 100;

export type StatementLine = {
  gridId: number;
  gridCode: string;
  /** 該月生效嘅租約（冇租約但有銷售就係 null） */
  leaseId: number | null;
  sales: number;
  payroll: number;
  rent: number;
  rentState: RentMonthState | "none";
  payback: number;
};

export type StatementTotals = { sales: number; payroll: number; rent: number; payback: number };

export type StatementInput = {
  month: string;
  currentMonth: string;
  payrollRatePercent: number;
  /** 該租戶該月每筆（或者每格）銷售額，同一格可以有多行，會加埋 */
  sales: { gridId: number; gridCode: string; amount: number }[];
  /** 該租戶嘅租約（任何期間都可以，會自動揀返覆蓋該月嗰啲） */
  leases: (LeaseLite & { id: number; gridId: number; gridCode: string })[];
  records: (RentRecordLite & { leaseId: number })[];
};

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) => c / 100;

export function buildStatement(input: StatementInput): { lines: StatementLine[]; totals: StatementTotals } {
  const salesCents = new Map<number, { gridCode: string; cents: number }>();
  for (const s of input.sales) {
    const prev = salesCents.get(s.gridId);
    salesCents.set(s.gridId, { gridCode: s.gridCode, cents: (prev?.cents ?? 0) + cents(s.amount) });
  }

  // 每個格仔：該月覆蓋到嘅租約嘅租金加埋
  const rentByGrid = new Map<number, { gridCode: string; cents: number; leaseId: number; state: RentMonthState }>();
  for (const l of [...input.leases].sort((a, b) => a.id - b.id)) {
    const schedule = buildRentSchedule(l, input.records.filter((r) => r.leaseId === l.id), input.currentMonth);
    const m = schedule.months.find((x) => x.month === input.month);
    if (!m) continue;
    const prev = rentByGrid.get(l.gridId);
    rentByGrid.set(l.gridId, { gridCode: l.gridCode, cents: (prev?.cents ?? 0) + cents(m.amount), leaseId: l.id, state: prev?.state ?? m.state });
  }

  const gridIds = new Set([...salesCents.keys(), ...rentByGrid.keys()]);
  const rows = [...gridIds].map((gridId) => {
    const s = salesCents.get(gridId);
    const r = rentByGrid.get(gridId);
    const salesC = s?.cents ?? 0;
    return {
      line: {
        gridId,
        gridCode: (s?.gridCode ?? r?.gridCode)!,
        leaseId: r?.leaseId ?? null,
        sales: money(salesC),
        payroll: money(Math.round((salesC * input.payrollRatePercent) / 100)),
        rent: money(r?.cents ?? 0),
        rentState: r?.state ?? ("none" as const),
        payback: money(salesC),
      } satisfies StatementLine,
      cents: { sales: salesC, payroll: Math.round((salesC * input.payrollRatePercent) / 100), rent: r?.cents ?? 0, payback: salesC },
    };
  }).sort((a, b) => a.line.gridCode.localeCompare(b.line.gridCode));

  const total = (k: keyof StatementTotals) => money(rows.reduce((n, r) => n + r.cents[k], 0));
  return { lines: rows.map((r) => r.line), totals: { sales: total("sales"), payroll: total("payroll"), rent: total("rent"), payback: total("payback") } };
}

const lineSchema = z.object({
  gridId: z.number(),
  gridCode: z.string(),
  leaseId: z.number().nullable(),
  sales: z.number(),
  payroll: z.number(),
  rent: z.number(),
  rentState: z.enum(["paid", "unpaid", "missing", "free", "none"]),
  payback: z.number(),
});

/** 讀返存低嘅月結單明細（JSON 字串）；壞咗就當冇，唔好令整頁死 */
export function parseStatementLines(text: string): StatementLine[] {
  try {
    const parsed = z.array(lineSchema).safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

type Comparable = { lines: StatementLine[]; totals: StatementTotals };

/** 兩份月結單數字一唔一樣（逐格比較銷售、payroll、租金、payback）；用嚟提示確認之後有冇郁過數。租金收咗未（狀態）唔當郁數。 */
export function sameStatement(a: Comparable, b: Comparable): boolean {
  const key = (l: StatementLine) => `${l.gridId}|${l.sales}|${l.payroll}|${l.rent}|${l.payback}`;
  const sig = (c: Comparable) => c.lines.map(key).sort().join(";") + `#${c.totals.sales}|${c.totals.payroll}|${c.totals.rent}|${c.totals.payback}`;
  return sig(a) === sig(b);
}

/** 上一個月（月結一般結上個月） */
export function previousMonth(month: string): string {
  const d = new Date(month + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/**
 * 租約逐月租金確認：由租約日期 + 已開嘅租金單，砌出租約期內每個月嘅狀態同數目。
 * 純函數，前後端共用，方便測試。免租期只影響「冇租金單嘅整月」：成個月都喺免租日數入面就唔使收。
 */

export type RentRecordLite = {
  id: number;
  month: string;
  amount: string | number;
  status: "unpaid" | "paid";
  paidAt: string | null;
};

export type LeaseLite = {
  startDate: string;
  endDate: string;
  rentFreeDays: number;
  monthlyRent: string | number;
};

/** paid = 已確認收款；unpaid = 已開單未收；missing = 未開單；free = 整月免租（冇單） */
export type RentMonthState = "paid" | "unpaid" | "missing" | "free";

export type RentMonth = {
  month: string;
  state: RentMonthState;
  amount: number;
  recordId: number | null;
  paidAt: string | null;
  /** 呢個月已經到期（等於或者早過當月） */
  due: boolean;
};

export type RentSummary = {
  totalMonths: number;
  freeMonths: number;
  /** 要收租嘅月數（唔計整月免租、冇單嘅月份） */
  collectableMonths: number;
  confirmedMonths: number;
  confirmedAmount: number;
  /** 已到期但未確認收款（未收或者未開單） */
  overdueMonths: number;
  overdueAmount: number;
  /** 唔喺租約期內嘅租金單數量 */
  outsideRecords: number;
};

export type RentSchedule = { months: RentMonth[]; summary: RentSummary };

/** 租約最多推算幾多個月，防止日期寫錯（例如 9999 年）令畫面卡死 */
const MAX_MONTHS = 600;
const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const ym = (d: Date) => d.toISOString().slice(0, 7);

/** 香港時間（UTC+8）而家係幾月，月份喺 00:00 HKT 轉 */
export function hkMonthOf(now: Date): string {
  return ym(new Date(now.getTime() + HK_OFFSET_MS));
}

/** 香港日期（YYYY-MM-DD） */
export function hkDateOf(now: Date): string {
  return new Date(now.getTime() + HK_OFFSET_MS).toISOString().slice(0, 10);
}

export function monthsOfLease(startDate: string, endDate: string): string[] {
  const start = startDate.slice(0, 7);
  const end = endDate.slice(0, 7);
  const months: string[] = [];
  for (let d = new Date(start + "-01T00:00:00Z"); ym(d) <= end && months.length < MAX_MONTHS; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(ym(d));
  }
  return months;
}

/** 免租期最後一日（YYYY-MM-DD）；冇免租日數就係 null */
function freeUntil(startDate: string, rentFreeDays: number): string | null {
  if (rentFreeDays <= 0) return null;
  const d = new Date(startDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + rentFreeDays - 1);
  return d.toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  const d = new Date(month + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** 同一個月有多張單就攞已收嗰張（其次最早開嗰張） */
function pickRecord(records: RentRecordLite[]): RentRecordLite | undefined {
  return [...records].sort((a, b) => Number(b.status === "paid") - Number(a.status === "paid") || a.id - b.id)[0];
}

export function buildRentSchedule(lease: LeaseLite, records: RentRecordLite[], currentMonth: string): RentSchedule {
  const months = monthsOfLease(lease.startDate, lease.endDate);
  const inPeriod = new Set(months);
  const free = freeUntil(lease.startDate, lease.rentFreeDays);
  const rentCents = cents(Number(lease.monthlyRent));

  const byMonth = new Map<string, RentRecordLite[]>();
  for (const r of records) if (inPeriod.has(r.month)) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);

  const rows: (RentMonth & { cents: number })[] = months.map((month) => {
    const record = pickRecord(byMonth.get(month) ?? []);
    const due = month <= currentMonth;
    if (record) {
      const c = cents(Number(record.amount));
      return { month, state: record.status, amount: fromCents(c), cents: c, recordId: record.id, paidAt: record.paidAt, due };
    }
    if (free && lastDayOf(month) <= free) return { month, state: "free", amount: 0, cents: 0, recordId: null, paidAt: null, due };
    return { month, state: "missing", amount: fromCents(rentCents), cents: rentCents, recordId: null, paidAt: null, due };
  });

  const sum = (pick: (r: (typeof rows)[number]) => boolean) => rows.filter(pick).reduce((n, r) => n + r.cents, 0);
  const isOverdue = (r: (typeof rows)[number]) => r.due && (r.state === "unpaid" || r.state === "missing");

  return {
    months: rows.map(({ cents: _cents, ...m }) => m),
    summary: {
      totalMonths: rows.length,
      freeMonths: rows.filter((r) => r.state === "free").length,
      collectableMonths: rows.filter((r) => r.state !== "free").length,
      confirmedMonths: rows.filter((r) => r.state === "paid").length,
      confirmedAmount: fromCents(sum((r) => r.state === "paid")),
      overdueMonths: rows.filter(isOverdue).length,
      overdueAmount: fromCents(sum(isOverdue)),
      outsideRecords: records.filter((r) => !inPeriod.has(r.month)).length,
    },
  };
}

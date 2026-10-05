/**
 * 兼職人工計算（前後端共用，純函數）。
 * 規則：時薪制；工時有兩個來源，可以並存：
 *   1. 考勤機匯入（每人每月一條：總工時 × 匯入時嘅時薪）
 *   2. 手動輸入嘅更（每更工時 = 落更 − 返工 − 休息，跨午夜自動計到翌日）
 * 每月人工 = 考勤人工 + Σ(每更工時 × 該更時薪) + 調整。
 * 店舖兼職員工冇供強積金，所以唔計強積金；實收 = 總人工。
 * 法定假日薪酬、獎金或扣減請用「調整」欄自行加減。
 */

/** 法定最低工資（港幣／小時）。2025-05-01 起為 $42.1；如勞工處公布新數字，改呢度就得 */
export const MIN_WAGE_HKD = 42.1;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 單更工時（小時，2 位小數）；落更早過返工 = 跨午夜 */
export function shiftHours(start: string, end: string, breakMinutes = 0): number {
  let mins = toMinutes(end) - toMinutes(start);
  if (mins <= 0) mins += 24 * 60;
  return round2(Math.max(0, mins - breakMinutes) / 60);
}

export function shiftPay(hours: number, hourlyRate: number): number {
  return round2(hours * hourlyRate);
}

export type PayrollShift = { startTime: string; endTime: string; breakMinutes: number; hourlyRate: number | string };
/** 考勤機匯入嘅月度工時；payOverride = 店主手動改咗人工（冇就用 工時 × 時薪） */
export type PayrollAttendance = { shiftCount: number; hours: number | string; hourlyRate: number | string; payOverride?: number | string | null };

/** 考勤記錄嘅人工 */
export function attendancePay(a: Pick<PayrollAttendance, "hours" | "hourlyRate" | "payOverride">): number {
  if (a.payOverride !== null && a.payOverride !== undefined && a.payOverride !== "") return round2(Number(a.payOverride));
  return shiftPay(Number(a.hours), Number(a.hourlyRate));
}

/** 一個員工一個月嘅人工 */
export function computeMonthPay(shifts: PayrollShift[], attendance: PayrollAttendance | null = null, adjustment = 0) {
  let hours = 0;
  let base = 0;
  let count = shifts.length;
  let belowMinWage = false;
  for (const s of shifts) {
    const h = shiftHours(s.startTime, s.endTime, s.breakMinutes);
    const rate = Number(s.hourlyRate);
    if (rate < MIN_WAGE_HKD) belowMinWage = true;
    hours += h;
    base += shiftPay(h, rate);
  }
  if (attendance) {
    const h = Number(attendance.hours);
    const rate = Number(attendance.hourlyRate);
    if (rate < MIN_WAGE_HKD) belowMinWage = true;
    hours += h;
    base += attendancePay(attendance);
    count += attendance.shiftCount;
  }
  base = round2(base);
  const gross = round2(base + adjustment);
  return {
    shifts: count,
    hours: round2(hours),
    base,
    adjustment: round2(adjustment),
    gross,
    belowMinWage,
  };
}

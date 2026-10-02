/**
 * 兼職人工計算（前後端共用，純函數）。
 * 規則：時薪制；每更工時 = 落更 − 返工 − 休息（跨午夜自動計到翌日）；
 * 每月人工 = Σ(每更工時 × 該更時薪)；強積金按「月薪」計算。
 * 呢度只計基本人工同強積金；法定假日薪酬、有薪年假等請用「調整」欄自行加減。
 */

/** 法定最低工資（港幣／小時）。2025-05-01 起為 $42.1；如勞工處公布新數字，改呢度就得 */
export const MIN_WAGE_HKD = 42.1;

/** 強積金（月薪計）：最低有關入息 $7,100（低過唔使供僱員部分）、最高有關入息 $30,000、供款率 5% */
export const MPF = { rate: 0.05, minRelevantIncome: 7100, maxRelevantIncome: 30000 } as const;

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

/** 強積金供款（每月）：僱主一定要供；僱員入息低過 $7,100 唔使供 */
export function mpfContributions(relevantIncome: number, enrolled: boolean) {
  if (!enrolled || relevantIncome <= 0) return { employee: 0, employer: 0 };
  const capped = Math.min(relevantIncome, MPF.maxRelevantIncome);
  return {
    employer: round2(capped * MPF.rate),
    employee: relevantIncome < MPF.minRelevantIncome ? 0 : round2(capped * MPF.rate),
  };
}

export type PayrollShift = { startTime: string; endTime: string; breakMinutes: number; hourlyRate: number | string };

/** 一個員工一個月嘅人工 */
export function computeMonthPay(shifts: PayrollShift[], mpfEnrolled: boolean, adjustment = 0) {
  let hours = 0;
  let base = 0;
  let belowMinWage = false;
  for (const s of shifts) {
    const h = shiftHours(s.startTime, s.endTime, s.breakMinutes);
    const rate = Number(s.hourlyRate);
    if (rate < MIN_WAGE_HKD) belowMinWage = true;
    hours += h;
    base += shiftPay(h, rate);
  }
  base = round2(base);
  // 調整（例如法定假日薪酬、獎金 +；扣減 −）計入有關入息
  const gross = round2(base + adjustment);
  const mpf = mpfContributions(gross, mpfEnrolled);
  return {
    shifts: shifts.length,
    hours: round2(hours),
    base,
    adjustment: round2(adjustment),
    gross,
    mpfEmployee: mpf.employee,
    mpfEmployer: mpf.employer,
    net: round2(gross - mpf.employee),
    belowMinWage,
  };
}

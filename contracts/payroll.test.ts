import { describe, expect, it } from "vitest";
import { computeMonthPay, mpfContributions, shiftHours } from "./payroll";

describe("shiftHours", () => {
  it("普通更", () => expect(shiftHours("10:00", "18:00", 60)).toBe(7));
  it("半個鐘", () => expect(shiftHours("12:00", "16:30", 0)).toBe(4.5));
  it("跨午夜", () => expect(shiftHours("22:00", "02:00", 0)).toBe(4));
  it("唔整除", () => expect(shiftHours("10:00", "10:20", 0)).toBe(0.33));
});

describe("mpfContributions", () => {
  it("冇參加 = 0", () => expect(mpfContributions(9000, false)).toEqual({ employee: 0, employer: 0 }));
  it("低過 $7,100：僱員唔使供，僱主照供", () => expect(mpfContributions(5000, true)).toEqual({ employee: 0, employer: 250 }));
  it("$7,100 或以上：雙方各 5%", () => expect(mpfContributions(7100, true)).toEqual({ employee: 355, employer: 355 }));
  it("超過 $30,000 封頂 $1,500", () => expect(mpfContributions(40000, true)).toEqual({ employee: 1500, employer: 1500 }));
});

describe("computeMonthPay", () => {
  const s = (startTime: string, endTime: string, breakMinutes: number, hourlyRate: number) => ({ startTime, endTime, breakMinutes, hourlyRate });
  it("加總工時人工，扣僱員強積金", () => {
    const r = computeMonthPay([s("10:00", "18:00", 60, 60), s("10:00", "14:00", 0, 60)].concat(Array(16).fill(s("10:00", "18:00", 60, 60))), true);
    expect(r.hours).toBe(7 * 17 + 4);
    expect(r.gross).toBe(123 * 60);
    expect(r.mpfEmployee).toBe(369);
    expect(r.net).toBe(7380 - 369);
  });
  it("調整計入入息", () => {
    const r = computeMonthPay([s("10:00", "14:00", 0, 50)], true, 300);
    expect(r).toMatchObject({ base: 200, gross: 500, mpfEmployee: 0, mpfEmployer: 25, net: 500 });
  });
  it("時薪低過最低工資會標記", () => expect(computeMonthPay([s("10:00", "11:00", 0, 40)], false).belowMinWage).toBe(true));
});

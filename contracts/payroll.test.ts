import { describe, expect, it } from "vitest";
import { computeMonthPay, shiftHours } from "./payroll";

describe("shiftHours", () => {
  it("普通更", () => expect(shiftHours("10:00", "18:00", 60)).toBe(7));
  it("半個鐘", () => expect(shiftHours("12:00", "16:30", 0)).toBe(4.5));
  it("跨午夜", () => expect(shiftHours("22:00", "02:00", 0)).toBe(4));
  it("唔整除", () => expect(shiftHours("10:00", "10:20", 0)).toBe(0.33));
});

describe("computeMonthPay", () => {
  const s = (startTime: string, endTime: string, breakMinutes: number, hourlyRate: number) => ({ startTime, endTime, breakMinutes, hourlyRate });
  it("加總工時人工（冇強積金）", () => {
    const r = computeMonthPay([s("10:00", "18:00", 60, 60), s("10:00", "14:00", 0, 60)].concat(Array(16).fill(s("10:00", "18:00", 60, 60))));
    expect(r.hours).toBe(7 * 17 + 4);
    expect(r.gross).toBe(123 * 60);
    expect(r.shifts).toBe(18);
  });
  it("調整加減", () => {
    const r = computeMonthPay([s("10:00", "14:00", 0, 50)], null, 300);
    expect(r).toMatchObject({ base: 200, adjustment: 300, gross: 500 });
  });
  it("考勤匯入 + 手動更一齊計", () => {
    const r = computeMonthPay([s("10:00", "14:00", 0, 50)], { shiftCount: 3, hours: "24.12", hourlyRate: "60.00" });
    expect(r).toMatchObject({ shifts: 4, hours: 28.12, base: 1447.2 + 200, gross: 1647.2 });
  });
  it("時薪低過最低工資會標記", () => {
    expect(computeMonthPay([s("10:00", "11:00", 0, 40)]).belowMinWage).toBe(true);
    expect(computeMonthPay([], { shiftCount: 1, hours: 8, hourlyRate: 40 }).belowMinWage).toBe(true);
  });
});

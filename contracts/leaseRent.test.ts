import { describe, expect, it } from "vitest";
import { buildRentSchedule, hkDateOf, hkMonthOf, monthsOfLease, type RentRecordLite } from "./leaseRent";

const lease = (over: Partial<{ startDate: string; endDate: string; rentFreeDays: number; monthlyRent: string }> = {}) => ({
  startDate: "2026-03-03",
  endDate: "2026-08-31",
  rentFreeDays: 0,
  monthlyRent: "500.00",
  ...over,
});
const rec = (id: number, month: string, status: "paid" | "unpaid", amount = "500.00", paidAt: string | null = null): RentRecordLite => ({
  id,
  month,
  status,
  amount,
  paidAt: status === "paid" ? (paidAt ?? "2026-04-05") : null,
});

describe("monthsOfLease", () => {
  it("lists every calendar month the lease touches, start and end months included", () => {
    expect(monthsOfLease("2026-03-03", "2026-08-31")).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  });

  it("crosses the year boundary", () => {
    expect(monthsOfLease("2026-11-15", "2027-02-14")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("returns one month for a lease inside a single month", () => {
    expect(monthsOfLease("2026-03-03", "2026-03-20")).toEqual(["2026-03"]);
  });

  it("returns nothing when the end is before the start", () => {
    expect(monthsOfLease("2026-03-03", "2026-02-01")).toEqual([]);
  });
});

describe("buildRentSchedule — 每月租金確認", () => {
  it("marks every month without a bill as missing and uses the lease rent as the expected amount", () => {
    // Arrange / Act
    const s = buildRentSchedule(lease(), [], "2026-03");

    // Assert
    expect(s.months).toHaveLength(6);
    expect(s.months.every((m) => m.state === "missing" && m.amount === 500 && m.recordId === null)).toBe(true);
  });

  it("counts confirmed (paid) months and the amount actually collected, using the bill's own amount", () => {
    const s = buildRentSchedule(lease(), [rec(1, "2026-03", "paid", "500.00"), rec(2, "2026-04", "paid", "450.00"), rec(3, "2026-05", "unpaid")], "2026-05");

    expect(s.summary.confirmedMonths).toBe(2);
    expect(s.summary.confirmedAmount).toBe(950);
    expect(s.months[1]).toMatchObject({ state: "paid", amount: 450, recordId: 2, paidAt: "2026-04-05" });
    expect(s.months[2]).toMatchObject({ state: "unpaid", recordId: 3, paidAt: null });
  });

  it("treats unpaid and missing months up to the current month as overdue, later months as not yet due", () => {
    const s = buildRentSchedule(lease(), [rec(1, "2026-03", "paid"), rec(2, "2026-04", "unpaid")], "2026-05");

    // 04 unpaid + 05 missing are due and unconfirmed; 06–08 are in the future
    expect(s.summary.overdueMonths).toBe(2);
    expect(s.summary.overdueAmount).toBe(1000);
    expect(s.months.map((m) => m.due)).toEqual([true, true, true, false, false, false]);
  });

  it("has no overdue months before the lease starts", () => {
    const s = buildRentSchedule(lease(), [], "2026-02");

    expect(s.summary.overdueMonths).toBe(0);
    expect(s.summary.overdueAmount).toBe(0);
  });

  it("treats every unconfirmed month as overdue after the lease has ended", () => {
    const s = buildRentSchedule(lease(), [rec(1, "2026-03", "paid")], "2026-12");

    expect(s.summary.overdueMonths).toBe(5);
  });

  it("totals the months", () => {
    const s = buildRentSchedule(lease(), [], "2026-03");

    expect(s.summary).toMatchObject({ totalMonths: 6, freeMonths: 0, collectableMonths: 6, confirmedMonths: 0 });
  });
});

describe("buildRentSchedule — 免租期", () => {
  it("marks months that fall completely inside the rent-free days as free (no bill to collect)", () => {
    // 2026-03-03 + 84 free days → free until 2026-05-25, so March and April are free, May is not
    const s = buildRentSchedule(lease({ rentFreeDays: 84 }), [], "2026-08");

    expect(s.months.map((m) => m.state)).toEqual(["free", "free", "missing", "missing", "missing", "missing"]);
    expect(s.months[0].amount).toBe(0);
    expect(s.summary).toMatchObject({ freeMonths: 2, collectableMonths: 4 });
    expect(s.summary.overdueMonths).toBe(4);
  });

  it("does not mark a month free when the free days stop one day before the month ends", () => {
    // start 03-01, 30 free days → free through 03-30, March still has 03-31 to pay
    expect(buildRentSchedule(lease({ startDate: "2026-03-01", rentFreeDays: 30 }), [], "2026-03").months[0].state).toBe("missing");
    expect(buildRentSchedule(lease({ startDate: "2026-03-01", rentFreeDays: 31 }), [], "2026-03").months[0].state).toBe("free");
  });

  it("lets an existing bill win over the free-month rule", () => {
    const s = buildRentSchedule(lease({ rentFreeDays: 84 }), [rec(9, "2026-03", "paid", "100.00")], "2026-08");

    expect(s.months[0]).toMatchObject({ state: "paid", amount: 100 });
    expect(s.summary.freeMonths).toBe(1);
    expect(s.summary.collectableMonths).toBe(5);
  });
});

describe("buildRentSchedule — 特殊記錄", () => {
  it("counts bills that fall outside the lease period instead of silently dropping them", () => {
    const s = buildRentSchedule(lease(), [rec(1, "2026-02", "paid"), rec(2, "2027-01", "unpaid"), rec(3, "2026-04", "paid")], "2026-05");

    expect(s.summary.outsideRecords).toBe(2);
    expect(s.summary.confirmedMonths).toBe(1);
  });

  it("prefers the paid bill when a month has duplicates", () => {
    const s = buildRentSchedule(lease(), [rec(1, "2026-03", "unpaid"), rec(2, "2026-03", "paid")], "2026-03");

    expect(s.months[0]).toMatchObject({ state: "paid", recordId: 2 });
  });

  it("adds money in cents so floating-point dust never shows up", () => {
    const s = buildRentSchedule(lease({ monthlyRent: "0.10", endDate: "2026-05-31" }), [], "2026-05");

    expect(s.summary.overdueAmount).toBe(0.3);
  });
});

describe("hkMonthOf", () => {
  it("uses Hong Kong time (UTC+8), so the new month starts at 00:00 HKT", () => {
    expect(hkMonthOf(new Date("2026-10-31T15:59:59Z"))).toBe("2026-10");
    expect(hkMonthOf(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
  });
});

describe("hkDateOf", () => {
  it("returns the Hong Kong calendar date, which is a day ahead of UTC after 16:00", () => {
    expect(hkDateOf(new Date("2026-10-31T15:59:59Z"))).toBe("2026-10-31");
    expect(hkDateOf(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11-01");
  });
});

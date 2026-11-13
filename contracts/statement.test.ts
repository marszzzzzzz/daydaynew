import { describe, expect, it } from "vitest";
import { PAYROLL_RATE_PERCENT, buildStatement, parseStatementLines, previousMonth, sameStatement, type StatementInput } from "./statement";

const lease = (over: Partial<StatementInput["leases"][number]> = {}) => ({
  id: 1,
  gridId: 10,
  gridCode: "010",
  startDate: "2026-03-03",
  endDate: "2027-02-28",
  rentFreeDays: 0,
  monthlyRent: "500.00",
  ...over,
});
const input = (over: Partial<StatementInput> = {}): StatementInput => ({
  month: "2026-10",
  currentMonth: "2026-11",
  payrollRatePercent: PAYROLL_RATE_PERCENT,
  sales: [],
  leases: [],
  records: [],
  ...over,
});

describe("buildStatement — 每格每月", () => {
  it("is empty when the tenant has no sales and no lease covering the month", () => {
    const s = buildStatement(input());

    expect(s.lines).toEqual([]);
    expect(s.totals).toEqual({ sales: 0, payroll: 0, rent: 0, payback: 0 });
  });

  it("fills sales, payroll (100% of sales), rent and payback for a grid", () => {
    const s = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 1200 }], leases: [lease()] }));

    expect(s.lines).toEqual([{ gridId: 10, gridCode: "010", leaseId: 1, sales: 1200, payroll: 1200, rent: 500, rentState: "missing", payback: 1200 }]);
  });

  it("payback is the month's sales; rent is listed but not deducted", () => {
    const s = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 300 }], leases: [lease({ monthlyRent: "700" })] }));

    expect(s.lines[0].payback).toBe(300);
    expect(s.lines[0].rent).toBe(700);
  });

  it("payroll follows the rate while payback stays equal to sales", () => {
    const s = buildStatement(input({ payrollRatePercent: 50, sales: [{ gridId: 10, gridCode: "010", amount: 1000 }], leases: [lease()] }));

    expect(s.lines[0].payroll).toBe(500);
    expect(s.lines[0].payback).toBe(1000);
  });

  it("sums several sales rows of the same grid", () => {
    const s = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 100.1 }, { gridId: 10, gridCode: "010", amount: 200.2 }] }));

    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].sales).toBe(300.3);
  });

  it("still lists a leased grid with no sales (payback 0) so the rent shows", () => {
    const s = buildStatement(input({ leases: [lease()] }));

    expect(s.lines[0]).toMatchObject({ sales: 0, payroll: 0, rent: 500, payback: 0 });
  });

  it("ignores a lease that does not cover the month", () => {
    const s = buildStatement(input({ month: "2027-05", leases: [lease()] }));

    expect(s.lines).toEqual([]);
  });

  it("lists a grid that sold in the month even without a lease covering it (rent 0, state none)", () => {
    const s = buildStatement(input({ sales: [{ gridId: 11, gridCode: "011", amount: 80 }] }));

    expect(s.lines[0]).toMatchObject({ gridId: 11, leaseId: null, sales: 80, rent: 0, rentState: "none", payback: 80 });
  });
});

describe("buildStatement — 租金來源", () => {
  it("uses 0 for a whole free month", () => {
    const s = buildStatement(input({ month: "2026-04", leases: [lease({ rentFreeDays: 84 })] }));

    expect(s.lines[0]).toMatchObject({ rent: 0, rentState: "free" });
  });

  it("uses the bill's own amount and state when a rent bill exists", () => {
    const s = buildStatement(input({ leases: [lease()], records: [{ leaseId: 1, id: 7, month: "2026-10", amount: "450.00", status: "paid", paidAt: "2026-10-03" }] }));

    expect(s.lines[0]).toMatchObject({ rent: 450, rentState: "paid" });
  });

  it("only uses rent bills that belong to the lease", () => {
    const s = buildStatement(input({ leases: [lease()], records: [{ leaseId: 99, id: 7, month: "2026-10", amount: "1.00", status: "paid", paidAt: "2026-10-03" }] }));

    expect(s.lines[0].rent).toBe(500);
  });

  it("merges two leases of one grid in the same month into one line with the rents added", () => {
    const s = buildStatement(
      input({ leases: [lease({ id: 1, startDate: "2026-03-01", endDate: "2026-10-15" }), lease({ id: 2, startDate: "2026-10-16", endDate: "2027-03-31", monthlyRent: "600" })] }),
    );

    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].rent).toBe(1100);
    expect(s.lines[0].leaseId).toBe(2);
  });
});

describe("buildStatement — 合計", () => {
  it("orders grids by code and totals every column", () => {
    const s = buildStatement(
      input({
        sales: [{ gridId: 12, gridCode: "012", amount: 0.1 }, { gridId: 10, gridCode: "010", amount: 0.2 }],
        leases: [lease(), lease({ id: 2, gridId: 12, gridCode: "012", monthlyRent: "300" })],
      }),
    );

    expect(s.lines.map((l) => l.gridCode)).toEqual(["010", "012"]);
    expect(s.totals).toEqual({ sales: 0.3, payroll: 0.3, rent: 800, payback: 0.3 });
  });
});

describe("parseStatementLines", () => {
  const built = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 100 }], leases: [lease()] }));

  it("round-trips the lines that were saved as JSON", () => {
    expect(parseStatementLines(JSON.stringify(built.lines))).toEqual(built.lines);
  });

  it("returns an empty list instead of throwing when the saved text is broken", () => {
    expect(parseStatementLines("not json")).toEqual([]);
    expect(parseStatementLines('[{"gridId":"x"}]')).toEqual([]);
  });
});

describe("sameStatement — 確認之後有冇郁過數", () => {
  const live = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 100 }], leases: [lease()] }));

  it("is true for identical numbers, whatever the key order of the saved copy", () => {
    const saved = { lines: parseStatementLines(JSON.stringify(live.lines.map((l) => Object.fromEntries(Object.entries(l).reverse())))), totals: live.totals };

    expect(sameStatement(saved, live)).toBe(true);
  });

  it("is false when a grid's sales changed", () => {
    const changed = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 150 }], leases: [lease()] }));

    expect(sameStatement(live, changed)).toBe(false);
  });

  it("ignores a rent bill being paid afterwards — only numbers count", () => {
    const paid = buildStatement(
      input({ sales: [{ gridId: 10, gridCode: "010", amount: 100 }], leases: [lease()], records: [{ leaseId: 1, id: 3, month: "2026-10", amount: "500.00", status: "paid", paidAt: "2026-10-30" }] }),
    );

    expect(sameStatement(live, paid)).toBe(true);
  });

  it("is false when a grid appears or disappears", () => {
    const more = buildStatement(input({ sales: [{ gridId: 10, gridCode: "010", amount: 100 }, { gridId: 11, gridCode: "011", amount: 5 }], leases: [lease()] }));

    expect(sameStatement(live, more)).toBe(false);
  });
});

describe("previousMonth", () => {
  it("steps back one month, across the year boundary too", () => {
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

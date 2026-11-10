import { describe, expect, it } from "vitest";
import { rankingRange } from "./rankingRange";

const TODAY = "2026-11-10";

describe("rankingRange", () => {
  it("1 month = the calendar month of the latest sale", () => {
    expect(rankingRange("1m", { first: "2026-06-29", last: "2026-10-31" }, TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("3 months = the latest month plus the two before it", () => {
    expect(rankingRange("3m", { first: "2026-06-29", last: "2026-10-31" }, TODAY)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
  });

  it("12 months crosses the year boundary", () => {
    expect(rankingRange("12m", { first: "2025-01-01", last: "2026-02-14" }, TODAY)).toEqual({ from: "2025-03-01", to: "2026-02-28" });
  });

  it("all = from the first sale to the end of the latest month", () => {
    expect(rankingRange("all", { first: "2026-06-29", last: "2026-10-31" }, TODAY)).toEqual({ from: "2026-06-29", to: "2026-10-31" });
  });

  it("never ends after today, so the current month is cut at today", () => {
    expect(rankingRange("1m", { first: "2026-06-29", last: "2026-11-03" }, TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("falls back to today's month when there are no sales yet", () => {
    expect(rankingRange("3m", { first: null, last: null }, TODAY)).toEqual({ from: "2026-09-01", to: "2026-11-10" });
  });

  it("does not start before the first sale", () => {
    expect(rankingRange("12m", { first: "2026-06-29", last: "2026-10-31" }, TODAY).from).toBe("2026-06-29");
  });
});

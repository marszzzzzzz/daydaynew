import { describe, expect, it } from "vitest";
import { bannerInputSchema, hkToday, isBannerLive, isSafeLink } from "./banner";

const base = { enabled: true, title: "十月優惠", body: "新租戶首月免租", linkUrl: "", linkLabel: "", startDate: "", endDate: "" };

describe("isSafeLink", () => {
  it("accepts https, site paths and WhatsApp", () => {
    expect(isSafeLink("https://wa.me/85291234567")).toBe(true);
    expect(isSafeLink("/login")).toBe(true);
    expect(isSafeLink("http://example.com/a?b=1")).toBe(true);
  });
  it("rejects javascript:, data:, protocol-relative and plain text", () => {
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink(" JavaScript:alert(1)")).toBe(false);
    expect(isSafeLink("data:text/html,x")).toBe(false);
    expect(isSafeLink("//evil.com")).toBe(false);
    expect(isSafeLink("www.example.com")).toBe(false);
  });
});

describe("hkToday", () => {
  it("uses Hong Kong date, not UTC", () => {
    // 2026-10-23 17:30 UTC = 2026-10-24 01:30 HKT
    expect(hkToday(new Date("2026-10-23T17:30:00Z"))).toBe("2026-10-24");
    expect(hkToday(new Date("2026-10-23T15:59:00Z"))).toBe("2026-10-23");
  });
});

describe("isBannerLive", () => {
  it("is hidden when disabled", () => expect(isBannerLive({ ...base, enabled: false }, "2026-10-24")).toBe(false));
  it("shows with no dates", () => expect(isBannerLive(base, "2026-10-24")).toBe(true));
  it("respects start and end dates inclusively", () => {
    const b = { ...base, startDate: "2026-10-24", endDate: "2026-10-31" };
    expect(isBannerLive(b, "2026-10-23")).toBe(false);
    expect(isBannerLive(b, "2026-10-24")).toBe(true);
    expect(isBannerLive(b, "2026-10-31")).toBe(true);
    expect(isBannerLive(b, "2026-11-01")).toBe(false);
  });
});

describe("bannerInputSchema", () => {
  it("trims text and accepts a valid banner", () => {
    const r = bannerInputSchema.parse({ ...base, title: "  十月優惠 ", linkUrl: " /login ", linkLabel: "立即登入" });
    expect(r.title).toBe("十月優惠");
    expect(r.linkUrl).toBe("/login");
  });
  it("requires a title when enabled", () => {
    expect(bannerInputSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(bannerInputSchema.safeParse({ ...base, enabled: false, title: "" }).success).toBe(true);
  });
  it("rejects unsafe links", () => {
    const r = bannerInputSchema.safeParse({ ...base, linkUrl: "javascript:alert(1)", linkLabel: "click" });
    expect(r.success).toBe(false);
  });
  it("requires button text when a link is set", () => {
    expect(bannerInputSchema.safeParse({ ...base, linkUrl: "/login", linkLabel: "" }).success).toBe(false);
  });
  it("rejects end date before start date", () => {
    expect(bannerInputSchema.safeParse({ ...base, startDate: "2026-11-01", endDate: "2026-10-01" }).success).toBe(false);
  });
  it("rejects over-long text", () => {
    expect(bannerInputSchema.safeParse({ ...base, body: "字".repeat(201) }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { extractGridCodes, extractPrices, graphPostsSchema, guessPostType, isAllowedImageHost, ruleInsight, sanitizeInsight } from "./facebook";

describe("extractGridCodes", () => {
  it("finds grid codes written in the usual ways and keeps only 001–070", () => {
    expect(extractGridCodes("012格、格仔 035 同 #070 招租；099格唔存在")).toEqual(["012", "035", "070"]);
  });
  it("ignores prices, phone numbers and years", () => {
    expect(extractGridCodes("$012 9149 2405 2026年 第3格")).toEqual(["003"]);
  });
});

describe("extractPrices", () => {
  it("reads $, HK$ and 蚊 prices", () => {
    expect(extractPrices("新貨 $89，大碼 HK$ 120.5，散賣 15蚊")).toEqual([89, 120.5, 15]);
  });
  it("returns nothing when there is no price", () => {
    expect(extractPrices("今日休息")).toEqual([]);
  });
});

describe("guessPostType", () => {
  it("classifies common shop posts", () => {
    expect(guessPostType("北角格仔鋪 012格招租，首月免租")).toBe("rental");
    expect(guessPostType("十一月週末手作市集，限時優惠")).toBe("event");
    expect(guessPostType("新貨到！寶可夢散卡 $1 一張")).toBe("product");
    expect(guessPostType("各位格主請注意：下星期一盤點")).toBe("tenant");
    expect(guessPostType("早晨")).toBe("other");
  });
});

describe("ruleInsight", () => {
  it("builds a summary from the first line plus codes and a single product price", () => {
    const r = ruleInsight("新貨到！Neoflam 保鮮盒\n只係 $89，放喺 012格");
    expect(r).toMatchObject({ type: "product", summary: "新貨到！Neoflam 保鮮盒", gridCodes: ["012"], products: [{ name: "新貨到！Neoflam 保鮮盒", price: 89 }] });
  });
  it("handles photo-only posts with no text", () => {
    expect(ruleInsight("")).toMatchObject({ type: "other", summary: "（冇文字）", products: [] });
  });
});

describe("sanitizeInsight", () => {
  it("drops invalid grid codes, bad dates, negative prices and over-long text", () => {
    const r = sanitizeInsight({
      type: "event",
      summary: "長".repeat(300),
      gridCodes: ["012", "999", "abc", "012"],
      products: [{ name: "公仔", price: -5 }, { name: "  ", price: 10 }, { name: "水樽", price: 30 }],
      eventStart: "2026-11-01",
      eventEnd: "明天",
      followUps: ["覆客人", ""],
    });
    expect([...r.summary].length).toBe(200);
    expect(r.gridCodes).toEqual(["012"]);
    expect(r.products).toEqual([{ name: "公仔", price: null }, { name: "水樽", price: 30 }]);
    expect(r.eventStart).toBe("2026-11-01");
    expect(r.eventEnd).toBe("");
    expect(r.followUps).toEqual(["覆客人"]);
  });
  it("swaps an end date that is before the start date", () => {
    const r = sanitizeInsight({ type: "event", summary: "x", gridCodes: [], products: [], eventStart: "2026-11-10", eventEnd: "2026-11-01", followUps: [] });
    expect([r.eventStart, r.eventEnd]).toEqual(["2026-11-01", "2026-11-10"]);
  });
});

describe("graphPostsSchema", () => {
  it("accepts a Graph API page of posts and tolerates missing optional fields", () => {
    const r = graphPostsSchema.parse({ data: [{ id: "1_2", created_time: "2026-10-20T03:00:00+0000" }], paging: {} });
    expect(r.data[0].message).toBeUndefined();
  });
  it("rejects a response without data", () => {
    expect(graphPostsSchema.safeParse({ error: { message: "x" } }).success).toBe(false);
  });
});

describe("isAllowedImageHost", () => {
  it("only allows Facebook CDN over https", () => {
    expect(isAllowedImageHost("https://scontent.xx.fbcdn.net/v/t39/abc.jpg")).toBe(true);
    expect(isAllowedImageHost("http://scontent.xx.fbcdn.net/a.jpg")).toBe(false);
    expect(isAllowedImageHost("https://fbcdn.net.evil.com/a.jpg")).toBe(false);
    expect(isAllowedImageHost("https://169.254.169.254/latest")).toBe(false);
  });
  it("allows an extra host when configured (local tests)", () => {
    expect(isAllowedImageHost("http://localhost:3299/a.jpg", ["http://localhost:3299"])).toBe(true);
  });
});

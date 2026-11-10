import { describe, expect, it } from "vitest";
import { CATEGORY_TOP_LIMIT, RANKING_LIMIT, UNCATEGORIZED, rankProducts, type ProductTotal } from "./salesRanking";

const row = (name: string, qty: number, amount: number, category = ""): ProductTotal => ({ name, qty, amount, category });

describe("rankProducts — 銷量排行", () => {
  it("returns empty totals and lists when nothing was sold", () => {
    const r = rankProducts([]);

    expect(r).toEqual({ totalQty: 0, totalAmount: 0, productCount: 0, topByQty: [], categories: [] });
  });

  it("ranks products by quantity, then amount, then name", () => {
    // Arrange
    const rows = [row("b", 5, 50), row("a", 5, 80), row("c", 9, 10), row("d", 5, 80)];

    // Act
    const names = rankProducts(rows).topByQty.map((p) => p.name);

    // Assert
    expect(names).toEqual(["c", "a", "d", "b"]);
  });

  it("totals quantity and amount across every product, not just the listed ones", () => {
    const rows = Array.from({ length: RANKING_LIMIT + 5 }, (_, i) => row(`貨${i}`, 1, 2));

    const r = rankProducts(rows);

    expect(r.topByQty).toHaveLength(RANKING_LIMIT);
    expect(r.productCount).toBe(RANKING_LIMIT + 5);
    expect(r.totalQty).toBe(RANKING_LIMIT + 5);
    expect(r.totalAmount).toBe((RANKING_LIMIT + 5) * 2);
  });

  it("rounds money to cents", () => {
    const r = rankProducts([row("甲", 3, 0.1), row("乙", 1, 0.2)]);

    expect(r.totalAmount).toBe(0.3);
  });

  it("carries each product's category into the ranking", () => {
    const r = rankProducts([row("泳衣", 3, 300, "衣物"), row("散Card", 9, 9)]);

    expect(r.topByQty.map((p) => [p.name, p.category])).toEqual([["散Card", ""], ["泳衣", "衣物"]]);
  });
});

describe("rankProducts — 各類別最好賣", () => {
  it("groups products by category and sorts categories by quantity", () => {
    const rows = [row("泳衣", 5, 500, "衣物"), row("背包", 2, 200, "袋"), row("短褲", 4, 160, "衣物"), row("錢包", 6, 240, "袋")];

    const cats = rankProducts(rows).categories;

    expect(cats.map((c) => [c.category, c.qty, c.amount, c.productCount])).toEqual([
      ["衣物", 9, 660, 2],
      ["袋", 8, 440, 2],
    ]);
  });

  it("lists each category's products best-selling first", () => {
    const rows = [row("短褲", 4, 160, "衣物"), row("泳衣", 5, 500, "衣物")];

    const cat = rankProducts(rows).categories[0];

    expect(cat.top.map((p) => p.name)).toEqual(["泳衣", "短褲"]);
  });

  it("caps each category's list but keeps the true product count", () => {
    const rows = Array.from({ length: CATEGORY_TOP_LIMIT + 3 }, (_, i) => row(`貨${i}`, 100 - i, 10, "雜貨"));

    const cat = rankProducts(rows).categories[0];

    expect(cat.top).toHaveLength(CATEGORY_TOP_LIMIT);
    expect(cat.productCount).toBe(CATEGORY_TOP_LIMIT + 3);
  });

  it("puts products without a category into 未分類, always last, even when it sells the most", () => {
    const rows = [row("散Card", 400, 400), row("泳衣", 5, 500, "衣物")];

    const cats = rankProducts(rows).categories;

    expect(cats.map((c) => c.category)).toEqual(["衣物", UNCATEGORIZED]);
    expect(cats[1].uncategorized).toBe(true);
    expect(cats[0].uncategorized).toBe(false);
  });

  it("treats blank or whitespace-only categories as 未分類 and trims real ones", () => {
    const rows = [row("甲", 1, 1, "   "), row("乙", 1, 1, " 衣物 "), row("丙", 1, 1, "衣物")];

    const cats = rankProducts(rows).categories;

    expect(cats.map((c) => [c.category, c.productCount])).toEqual([["衣物", 2], [UNCATEGORIZED, 1]]);
  });

  it("does not create a 未分類 group when every product has a category", () => {
    const cats = rankProducts([row("甲", 1, 1, "衣物")]).categories;

    expect(cats.some((c) => c.uncategorized)).toBe(false);
  });
});

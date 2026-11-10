/** 銷售排行（店主「銷售分析」）：由「每件貨品喺期間內嘅總銷量」砌出銷量榜同各類別榜。純函數，方便測試。 */

export const UNCATEGORIZED = "未分類";
/** 銷量榜最多回傳幾多款 */
export const RANKING_LIMIT = 30;
/** 每個類別最多回傳幾多款貨品（productCount 仍然係真實總數） */
export const CATEGORY_TOP_LIMIT = 10;

export type ProductTotal = { name: string; qty: number; amount: number; category: string };
export type RankedProduct = ProductTotal;
export type CategoryRanking = {
  category: string;
  /** 冇設定類別嘅貨品歸呢組，永遠排最後 */
  uncategorized: boolean;
  qty: number;
  amount: number;
  productCount: number;
  top: { name: string; qty: number; amount: number }[];
};
export type SalesRanking = {
  totalQty: number;
  totalAmount: number;
  productCount: number;
  topByQty: RankedProduct[];
  categories: CategoryRanking[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 銷量多 → 銷售額高 → 名 A-Z（次序固定，重新整理唔會跳） */
const bySales = (a: { name: string; qty: number; amount: number }, b: { name: string; qty: number; amount: number }) =>
  b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name);

export function rankProducts(rows: ProductTotal[]): SalesRanking {
  const products = rows.map((p) => ({ ...p, category: p.category.trim() })).sort(bySales);

  const groups = new Map<string, ProductTotal[]>();
  for (const p of products) {
    const key = p.category === "" ? UNCATEGORIZED : p.category;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const categories: CategoryRanking[] = [...groups.entries()]
    .map(([category, items]) => ({
      category,
      uncategorized: category === UNCATEGORIZED,
      qty: items.reduce((n, p) => n + p.qty, 0),
      amount: r2(items.reduce((n, p) => n + p.amount, 0)),
      productCount: items.length,
      top: items.slice(0, CATEGORY_TOP_LIMIT).map(({ name, qty, amount }) => ({ name, qty, amount: r2(amount) })),
    }))
    .sort((a, b) => Number(a.uncategorized) - Number(b.uncategorized) || bySales({ name: a.category, ...a }, { name: b.category, ...b }));

  return {
    totalQty: products.reduce((n, p) => n + p.qty, 0),
    totalAmount: r2(products.reduce((n, p) => n + p.amount, 0)),
    productCount: products.length,
    topByQty: products.slice(0, RANKING_LIMIT).map((p) => ({ ...p, amount: r2(p.amount) })),
    categories,
  };
}

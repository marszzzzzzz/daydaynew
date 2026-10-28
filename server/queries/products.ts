import { asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { products, sales, showcaseSettings } from "@db/schema";
import { getDb } from "./connection";

/** 全站只有一條輪播設定 */
const SETTINGS_ID = 1;
export const DEFAULT_SETTINGS = { enabled: false, bestDays: 30, bestCount: 12 };

/** 列表唔讀相片本身（每張幾百 KB），只讀有冇相同版本 */
const productFields = {
  id: products.id,
  sourceName: products.sourceName,
  displayName: products.displayName,
  description: products.description,
  keywords: products.keywords,
  category: products.category,
  listPrice: products.listPrice,
  featured: products.featured,
  featuredRank: products.featuredRank,
  hidden: products.hidden,
  hasImage: sql<boolean>`${products.image} is not null`,
  imageVersion: products.imageVersion,
};

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

export function imageUrlOf(p: { id: number; hasImage: boolean; imageVersion: number }): string | null {
  return p.hasImage ? `/api/products/${p.id}/image?v=${p.imageVersion}` : null;
}

export async function readSettings() {
  const [row] = await getDb().select().from(showcaseSettings).where(eq(showcaseSettings.id, SETTINGS_ID)).limit(1);
  return row ? { enabled: row.enabled, bestDays: row.bestDays, bestCount: row.bestCount } : DEFAULT_SETTINGS;
}

export async function saveSettings(values: typeof DEFAULT_SETTINGS) {
  await getDb()
    .insert(showcaseSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: showcaseSettings.id, set: { ...values, updatedAt: new Date() } });
}

export async function listProducts() {
  return getDb().select(productFields).from(products);
}

export async function findProduct(sourceName: string) {
  const [row] = await getDb().select(productFields).from(products).where(eq(products.sourceName, sourceName)).limit(1);
  return row ?? null;
}

export async function listFeatured() {
  return getDb()
    .select(productFields)
    .from(products)
    .where(sql`${products.featured} and not ${products.hidden}`)
    .orderBy(asc(products.featuredRank), asc(products.id));
}

/** 每件貨最近一次售價（DISTINCT ON：每個名取最新一筆）；傳入 names 就只查嗰啲 */
export async function latestPrices(names?: string[]): Promise<Map<string, string>> {
  if (names?.length === 0) return new Map();
  const rows = await getDb()
    .selectDistinctOn([sales.productName], { name: sales.productName, price: sales.unitPrice })
    .from(sales)
    .where(names ? inArray(sales.productName, names) : undefined)
    .orderBy(sales.productName, desc(sales.saleDate), desc(sales.id));
  return new Map(rows.map((r) => [r.name, String(r.price)]));
}

/** 每件貨嘅總銷量同最後售出日期（後台列表用） */
export async function salesByProduct() {
  const rows = await getDb()
    .select({
      name: sales.productName,
      qty: sql<number>`sum(${sales.quantity})`,
      lastSold: sql<string>`max(${sales.saleDate})`,
    })
    .from(sales)
    .groupBy(sales.productName);
  return rows.map((r) => ({ name: r.name, qty: Number(r.qty), lastSold: String(r.lastSold) }));
}

/**
 * 熱銷：由最新一筆銷售日期倒數 days 日（POS 通常成個月一次過匯入，用今日計會經常係空）。
 * 多攞啲，俾上層濾走隱藏貨品後再截。
 */
export async function bestSellers(days: number, limit: number) {
  const db = getDb();
  const [latest] = await db.select({ d: sql<string | null>`max(${sales.saleDate})` }).from(sales);
  if (!latest?.d) return [];
  const from = new Date(`${latest.d}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const qty = sql<number>`sum(${sales.quantity})`;
  const rows = await db
    .select({ name: sales.productName, qty })
    .from(sales)
    .where(gte(sales.saleDate, from.toISOString().slice(0, 10)))
    .groupBy(sales.productName)
    .orderBy(desc(qty), desc(sql`sum(${sales.totalAmount})`), asc(sales.productName))
    .limit(limit);
  return rows.map((r) => r.name);
}

export async function upsertProduct(sourceName: string, values: Partial<typeof products.$inferInsert>) {
  const [row] = await getDb()
    .insert(products)
    .values({ sourceName, ...values })
    .onConflictDoUpdate({ target: products.sourceName, set: { ...values, updatedAt: new Date() } })
    .returning({ id: products.id });
  return row.id;
}

export async function nextFeaturedRank() {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(${products.featuredRank})` })
    .from(products)
    .where(eq(products.featured, true));
  return Number(row?.max ?? -1) + 1;
}

export async function setFeaturedRanks(sourceNames: string[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [rank, name] of sourceNames.entries()) {
      await tx.update(products).set({ featuredRank: rank }).where(eq(products.sourceName, name));
    }
  });
}

export async function readImage(id: number) {
  const [row] = await getDb().select({ image: products.image, version: products.imageVersion }).from(products).where(eq(products.id, id)).limit(1);
  return row?.image ? { dataUrl: row.image, version: row.version } : null;
}

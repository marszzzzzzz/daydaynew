import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { products, sales } from "@db/schema";
import { getDb } from "./connection";

/** 列表唔讀相片本身（每張幾百 KB），只讀有冇相同版本 */
const productFields = {
  id: products.id,
  sourceName: products.sourceName,
  displayName: products.displayName,
  description: products.description,
  keywords: products.keywords,
  category: products.category,
  listPrice: products.listPrice,
  latestAt: products.latestAt,
  bestSeller: products.bestSeller,
  bestSellerRank: products.bestSellerRank,
  hidden: products.hidden,
  hasImage: sql<boolean>`${products.image} is not null`,
  imageVersion: products.imageVersion,
};

export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

export function imageUrlOf(p: { id: number; hasImage: boolean; imageVersion: number }): string | null {
  return p.hasImage ? `/api/products/${p.id}/image?v=${p.imageVersion}` : null;
}

export async function listProducts() {
  return getDb().select(productFields).from(products);
}

export async function findProduct(sourceName: string) {
  const [row] = await getDb().select(productFields).from(products).where(eq(products.sourceName, sourceName)).limit(1);
  return row ?? null;
}

/** 首頁上行：最新加入排最前 */
export async function listLatest(limit: number) {
  return getDb()
    .select(productFields)
    .from(products)
    .where(sql`${products.latestAt} is not null and not ${products.hidden}`)
    .orderBy(desc(products.latestAt), desc(products.id))
    .limit(limit);
}

/** 首頁下行：店主排嘅次序 */
export async function listBestSellers(limit: number) {
  return getDb()
    .select(productFields)
    .from(products)
    .where(sql`${products.bestSeller} and not ${products.hidden}`)
    .orderBy(asc(products.bestSellerRank), asc(products.id))
    .limit(limit);
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

export async function upsertProduct(sourceName: string, values: Partial<typeof products.$inferInsert>) {
  const [row] = await getDb()
    .insert(products)
    .values({ sourceName, ...values })
    .onConflictDoUpdate({ target: products.sourceName, set: { ...values, updatedAt: new Date() } })
    .returning({ id: products.id });
  return row.id;
}

export async function nextBestSellerRank() {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(${products.bestSellerRank})` })
    .from(products)
    .where(eq(products.bestSeller, true));
  return Number(row?.max ?? -1) + 1;
}

export async function setBestSellerRanks(sourceNames: string[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [rank, name] of sourceNames.entries()) {
      await tx.update(products).set({ bestSellerRank: rank }).where(eq(products.sourceName, name));
    }
  });
}

export async function readImage(id: number) {
  const [row] = await getDb().select({ image: products.image, version: products.imageVersion }).from(products).where(eq(products.id, id)).limit(1);
  return row?.image ? { dataUrl: row.image, version: row.version } : null;
}

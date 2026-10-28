import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { IMAGE_MAX_BYTES, LATEST_SHOWN, isImageDataUrl, productInputSchema, publicName, seoScore, type ShowcaseCard } from "@contracts/products";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import * as q from "./queries/products";

const BEST_SELLER_MAX = 30;
const LIST_MAX = 200;

function toCard(name: string, p: q.ProductRow | undefined, price: string | undefined): ShowcaseCard {
  return {
    name: p ? publicName(p) : name,
    description: p?.description ?? "",
    category: p?.category ?? "",
    price: p?.listPrice ?? price ?? null,
    imageUrl: p ? q.imageUrlOf(p) : null,
  };
}

/** 首頁輪播內容（llms.txt 亦用）：上行最新商品、下行熱銷產品；兩行都由店主揀，冇揀就係空 */
export async function buildShowcase() {
  const [latest, best] = await Promise.all([q.listLatest(LATEST_SHOWN), q.listBestSellers(BEST_SELLER_MAX)]);
  const prices = await q.latestPrices([...latest, ...best].map((p) => p.sourceName));
  const cards = (rows: q.ProductRow[]) => rows.map((p) => toCard(p.sourceName, p, prices.get(p.sourceName)));
  return { latest: cards(latest), bestSellers: cards(best) };
}

/**
 * 首頁位置 → DB 值。latestAt：新放入最新用 since（Facebook 帖文時間）或者而家；已經喺最新就唔郁，免得舊貨跳返最前。
 * 熱銷新加入排最尾，已經喺熱銷就保留次序。
 */
export async function placementValues(prev: q.ProductRow | null, flags: { latest: boolean; bestSeller: boolean }, since?: Date) {
  const latestAt = !flags.latest ? null : (since ?? prev?.latestAt ?? new Date());
  const bestSellerRank = !flags.bestSeller ? 0 : prev?.bestSeller ? prev.bestSellerRank : await q.nextBestSellerRank();
  return { latestAt, bestSeller: flags.bestSeller, bestSellerRank };
}

const imageInput = z.object({
  sourceName: z.string().trim().min(1).max(200),
  image: z
    .string()
    .nullable()
    .refine((s) => s === null || isImageDataUrl(s), `相片格式唔啱或者太大（最大 ${IMAGE_MAX_BYTES / 1000}KB，只收 JPG / PNG / WebP）`),
});

type ListRow = { sourceName: string; qty: number; latestAt: Date | null; bestSellerRank: number };
const byQty = (a: ListRow, b: ListRow) => b.qty - a.qty || a.sourceName.localeCompare(b.sourceName);
const sorters: Partial<Record<string, (a: ListRow, b: ListRow) => number>> = {
  latest: (a, b) => (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0),
  bestSeller: (a, b) => a.bestSellerRank - b.bestSellerRank,
};

export const productsRouter = createRouter({
  /** 公開：首頁輪播（最新 + 熱銷）；只回傳對外資料，唔包括銷量 */
  showcase: publicQuery.query(() => buildShowcase()),

  /** 店主：所有賣過嘅貨品 + 已設定 SEO 嘅貨品 */
  list: adminQuery
    .input(
      z.object({
        search: z.string().trim().max(100).default(""),
        filter: z.enum(["all", "todo", "latest", "bestSeller", "hidden"]).default("all"),
        limit: z.number().int().min(1).max(LIST_MAX).default(60),
      }),
    )
    .query(async ({ input }) => {
      const [stats, saved, prices] = await Promise.all([q.salesByProduct(), q.listProducts(), q.latestPrices()]);
      const byName = new Map(saved.map((p) => [p.sourceName, p]));
      const statByName = new Map(stats.map((s) => [s.name, s]));
      const names = new Set([...statByName.keys(), ...byName.keys()]);
      const rows = [...names].map((name) => {
        const p = byName.get(name);
        const s = statByName.get(name);
        const seo = { sourceName: name, displayName: p?.displayName ?? "", description: p?.description ?? "", keywords: p?.keywords ?? "", hasImage: !!p?.hasImage };
        return {
          ...seo,
          category: p?.category ?? "",
          latest: !!p?.latestAt,
          latestAt: p?.latestAt ?? null,
          bestSeller: !!p?.bestSeller,
          bestSellerRank: p?.bestSellerRank ?? 0,
          hidden: !!p?.hidden,
          imageUrl: p ? q.imageUrlOf(p) : null,
          qty: s?.qty ?? 0,
          lastSold: s?.lastSold ?? null,
          price: p?.listPrice ?? prices.get(name) ?? null,
          listPrice: p?.listPrice ?? null,
          posPrice: prices.get(name) ?? null,
          score: seoScore(seo),
        };
      });
      const counts = {
        all: rows.length,
        todo: rows.filter((r) => r.score < 100).length,
        latest: rows.filter((r) => r.latest).length,
        bestSeller: rows.filter((r) => r.bestSeller).length,
        hidden: rows.filter((r) => r.hidden).length,
      };
      const needle = input.search.toLowerCase();
      const matched = rows
        .filter((r) => (input.filter === "all" ? true : input.filter === "todo" ? r.score < 100 : r[input.filter]))
        .filter((r) => !needle || [r.sourceName, r.displayName, r.keywords].some((t) => t.toLowerCase().includes(needle)))
        .sort(sorters[input.filter] ?? byQty);
      return { rows: matched.slice(0, input.limit), total: matched.length, counts };
    }),

  /** 店主：儲存 SEO 名稱、描述、關鍵字、首頁位置（最新／熱銷／隱藏） */
  save: adminQuery.input(productInputSchema).mutation(async ({ ctx, input }) => {
    const prev = await q.findProduct(input.sourceName);
    const { sourceName, listPrice, latest, bestSeller, ...values } = input;
    const price = listPrice === undefined ? {} : { listPrice: listPrice === null ? null : listPrice.toFixed(2) };
    const placement = await placementValues(prev, { latest, bestSeller });
    await q.upsertProduct(sourceName, { ...values, ...price, ...placement, updatedBy: ctx.user.id });
    return { ok: true as const };
  }),

  /** 店主：上載／刪除商品相（前端已壓縮成 WebP） */
  setImage: adminQuery.input(imageInput).mutation(async ({ ctx, input }) => {
    const prev = await q.findProduct(input.sourceName);
    if (!prev && input.image === null) throw new TRPCError({ code: "NOT_FOUND", message: "呢件貨未有相" });
    const imageVersion = (prev?.imageVersion ?? 0) + 1;
    const id = await q.upsertProduct(input.sourceName, { image: input.image, imageVersion, updatedBy: ctx.user.id });
    return { ok: true as const, imageUrl: input.image ? q.imageUrlOf({ id, hasImage: true, imageVersion }) : null };
  }),

  /** 店主：熱銷排序（傳入新次序嘅 POS 名） */
  reorderBestSellers: adminQuery
    .input(z.object({ sourceNames: z.array(z.string().min(1).max(200)).max(BEST_SELLER_MAX * 4) }))
    .mutation(async ({ input }) => {
      await q.setBestSellerRanks(input.sourceNames);
      return { ok: true as const };
    }),
});

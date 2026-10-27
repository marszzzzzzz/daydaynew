import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { IMAGE_MAX_BYTES, isImageDataUrl, productInputSchema, publicName, seoScore, type ShowcaseCard } from "@contracts/products";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import * as q from "./queries/products";

/** 熱銷名單多攞幾個，濾走隱藏貨品之後都夠數 */
const HIDDEN_MARGIN = 20;
const FEATURED_MAX = 30;
const LIST_MAX = 200;

function toCard(name: string, p: q.ProductRow | undefined, price: string | undefined): ShowcaseCard {
  return {
    name: p ? publicName(p) : name,
    description: p?.description ?? "",
    category: p?.category ?? "",
    price: price ?? null,
    imageUrl: p ? q.imageUrlOf(p) : null,
  };
}

/** 首頁輪播內容；店主未開啟 = null（llms.txt 亦用） */
export async function buildShowcase() {
  const settings = await q.readSettings();
  if (!settings.enabled) return null;
  const [all, featuredRows, bestNames] = await Promise.all([
    q.listProducts(),
    q.listFeatured(),
    q.bestSellers(settings.bestDays, settings.bestCount + HIDDEN_MARGIN),
  ]);
  const byName = new Map(all.map((p) => [p.sourceName, p]));
  const best = bestNames.filter((n) => !byName.get(n)?.hidden).slice(0, settings.bestCount);
  const featured = featuredRows.slice(0, FEATURED_MAX);
  const prices = await q.latestPrices([...featured.map((p) => p.sourceName), ...best]);
  return {
    featured: featured.map((p) => toCard(p.sourceName, p, prices.get(p.sourceName))),
    bestSellers: best.map((n) => toCard(n, byName.get(n), prices.get(n))),
  };
}

const imageInput = z.object({
  sourceName: z.string().trim().min(1).max(200),
  image: z
    .string()
    .nullable()
    .refine((s) => s === null || isImageDataUrl(s), `相片格式唔啱或者太大（最大 ${IMAGE_MAX_BYTES / 1000}KB，只收 JPG / PNG / WebP）`),
});

const settingsInput = z.object({
  enabled: z.boolean(),
  bestDays: z.number().int().min(7, "最少 7 日").max(365, "最多 365 日"),
  bestCount: z.number().int().min(4, "最少 4 件").max(24, "最多 24 件"),
});

export const productsRouter = createRouter({
  /** 公開：首頁輪播（精選 + 熱銷）；只回傳對外資料，唔包括銷量 */
  showcase: publicQuery.query(() => buildShowcase()),

  /** 店主：所有賣過嘅貨品 + 已設定 SEO 嘅貨品 */
  list: adminQuery
    .input(
      z.object({
        search: z.string().trim().max(100).default(""),
        filter: z.enum(["all", "todo", "featured", "hidden"]).default("all"),
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
          featured: !!p?.featured,
          featuredRank: p?.featuredRank ?? 0,
          hidden: !!p?.hidden,
          imageUrl: p ? q.imageUrlOf(p) : null,
          qty: s?.qty ?? 0,
          lastSold: s?.lastSold ?? null,
          price: prices.get(name) ?? null,
          score: seoScore(seo),
        };
      });
      const counts = {
        all: rows.length,
        todo: rows.filter((r) => r.score < 100).length,
        featured: rows.filter((r) => r.featured).length,
        hidden: rows.filter((r) => r.hidden).length,
      };
      const needle = input.search.toLowerCase();
      const matched = rows
        .filter((r) => (input.filter === "all" ? true : input.filter === "todo" ? r.score < 100 : r[input.filter]))
        .filter((r) => !needle || [r.sourceName, r.displayName, r.keywords].some((t) => t.toLowerCase().includes(needle)))
        .sort((a, b) => (input.filter === "featured" ? a.featuredRank - b.featuredRank : b.qty - a.qty || a.sourceName.localeCompare(b.sourceName)));
      return { rows: matched.slice(0, input.limit), total: matched.length, counts };
    }),

  /** 店主：儲存 SEO 名稱、描述、關鍵字、精選／隱藏 */
  save: adminQuery.input(productInputSchema).mutation(async ({ ctx, input }) => {
    const prev = await q.findProduct(input.sourceName);
    const featuredRank = !input.featured ? 0 : prev?.featured ? prev.featuredRank : await q.nextFeaturedRank();
    const { sourceName, ...values } = input;
    await q.upsertProduct(sourceName, { ...values, featuredRank, updatedBy: ctx.user.id });
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

  /** 店主：精選排序（傳入新次序嘅 POS 名） */
  reorderFeatured: adminQuery
    .input(z.object({ sourceNames: z.array(z.string().min(1).max(200)).max(FEATURED_MAX * 4) }))
    .mutation(async ({ input }) => {
      await q.setFeaturedRanks(input.sourceNames);
      return { ok: true as const };
    }),

  settings: adminQuery.query(() => q.readSettings()),

  saveSettings: adminQuery.input(settingsInput).mutation(async ({ input }) => {
    await q.saveSettings(input);
    return { ok: true as const };
  }),
});

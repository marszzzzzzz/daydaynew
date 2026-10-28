import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { FB_POST_STATUSES, ruleInsight, type FbInsight } from "@contracts/facebook";
import { bannerInputSchema, isSafeLink } from "@contracts/banner";
import { PRODUCT_DESC_MAX, PRODUCT_NAME_MAX, PRODUCT_PRICE_MAX } from "@contracts/products";
import { createRouter, adminQuery } from "./middleware";
import { env } from "./lib/env";
import { saveBanner } from "./bannerRouter";
import { placementValues } from "./productsRouter";
import * as q from "./queries/facebook";
import * as products from "./queries/products";
import { FacebookError, downloadImage, isFacebookConfigured } from "./facebook/graph";
import { analyzePost, runSync } from "./facebook/sync";

const LIST_MAX = 100;
const BANNER_LINK_LABEL = "睇 Facebook 帖文";

function parseInsight(json: string, message: string): FbInsight {
  try {
    return JSON.parse(json) as FbInsight;
  } catch {
    return ruleInsight(message);
  }
}

async function requirePost(id: number) {
  const post = await q.findPost(id);
  if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢篇帖文" });
  return post;
}

/** Facebook 問題（權杖、下載相）用中文訊息回前端 */
async function withFacebookErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof FacebookError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
    throw e;
  }
}

const idInput = z.object({ id: z.number().int().positive() });

export const facebookRouter = createRouter({
  /** 設定狀態 + 上次同步結果 + 各狀態數目 */
  status: adminQuery.query(async () => {
    const [sync, counts] = await Promise.all([q.readSync(), q.countByStatus()]);
    return {
      configured: isFacebookConfigured(),
      aiEnabled: env.aiEnabled,
      cronEnabled: !!env.cronSecret,
      lastSyncAt: sync?.lastSyncAt ?? null,
      lastOk: sync?.lastOk ?? true,
      lastMessage: sync?.lastMessage ?? "",
      counts,
    };
  }),

  /** 店主撳「立即同步」 */
  sync: adminQuery.mutation(() => withFacebookErrors(runSync)),

  list: adminQuery
    .input(z.object({ status: z.enum([...FB_POST_STATUSES, "all"]).default("new"), limit: z.number().int().min(1).max(LIST_MAX).default(50) }))
    .query(async ({ input }) => {
      const rows = await q.listPosts(input.status, input.limit);
      return rows.map((p) => ({
        id: p.id,
        createdTime: p.createdTime,
        message: p.message,
        permalink: p.permalink,
        imageUrl: p.imageUrl,
        type: p.type,
        insight: parseInsight(p.insight, p.message),
        analyzedBy: p.analyzedBy,
        aiPending: p.aiPending,
        status: p.status,
        action: p.action,
        reviewedAt: p.reviewedAt,
      }));
    }),

  /** 再整理一次（有 AI key 用 AI，冇就用規則） */
  reanalyze: adminQuery.input(idInput).mutation(async ({ input }) => {
    const post = await requirePost(input.id);
    const r = await analyzePost(post);
    return { insight: r.insight, analyzedBy: r.by };
  }),

  /** 略過 / 標記已處理 / 放返入待處理 */
  setStatus: adminQuery
    .input(idInput.extend({ status: z.enum(FB_POST_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      await requirePost(input.id);
      const action = input.status === "ignored" ? "略過" : input.status === "done" ? "已處理" : "";
      await q.setStatus(input.id, input.status, action, ctx.user.id);
      return { ok: true as const };
    }),

  /** 活動帖 → 首頁「最新宣傳」橫幅（按鈕連去帖文） */
  applyBanner: adminQuery
    .input(idInput.extend({ title: z.string(), body: z.string(), startDate: z.string(), endDate: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await requirePost(input.id);
      const link = isSafeLink(post.permalink) ? post.permalink : "";
      const parsed = bannerInputSchema.safeParse({
        enabled: true,
        title: input.title,
        body: input.body,
        linkUrl: link,
        linkLabel: link ? BANNER_LINK_LABEL : "",
        startDate: input.startDate,
        endDate: input.endDate,
      });
      if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0].message });
      const r = await saveBanner(parsed.data, ctx.user.id);
      await q.setStatus(post.id, "done", `已轉做宣傳橫幅：${parsed.data.title}`, ctx.user.id);
      return r;
    }),

  /** 新貨帖 → 商品資料（對外名稱、描述、售價、相、精選） */
  applyProduct: adminQuery
    .input(
      idInput.extend({
        sourceName: z.string().trim().min(1, "請輸入貨品名稱").max(200),
        displayName: z.string().trim().max(PRODUCT_NAME_MAX, `對外名稱最多 ${PRODUCT_NAME_MAX} 字`),
        description: z.string().trim().max(PRODUCT_DESC_MAX, `描述最多 ${PRODUCT_DESC_MAX} 字`),
        listPrice: z.number().min(0, "售價唔可以係負數").max(PRODUCT_PRICE_MAX).nullable(),
        useImage: z.boolean(),
        /** 放入首頁「最新商品」（時間 = 帖文時間） */
        latest: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withFacebookErrors(async () => {
        const post = await requirePost(input.id);
        const prev = await products.findProduct(input.sourceName);
        const image = input.useImage && post.imageUrl ? await downloadImage(post.imageUrl) : null;
        // 冇剔「最新」就保留原本首頁位置；有剔就用帖文時間排
        const flags = { latest: input.latest || !!prev?.latestAt, bestSeller: !!prev?.bestSeller };
        const placement = await placementValues(prev, flags, input.latest ? new Date(post.createdTime) : undefined);
        await products.upsertProduct(input.sourceName, {
          displayName: input.displayName,
          description: input.description,
          listPrice: input.listPrice === null ? null : input.listPrice.toFixed(2),
          ...placement,
          ...(input.latest && { hidden: false }),
          ...(image && { image, imageVersion: (prev?.imageVersion ?? 0) + 1 }),
          updatedBy: ctx.user.id,
        });
        await q.setStatus(post.id, "done", `已更新商品：${input.displayName || input.sourceName}`, ctx.user.id);
        return { ok: true as const, imageSaved: !!image };
      }),
    ),
});

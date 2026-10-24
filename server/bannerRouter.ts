import { eq } from "drizzle-orm";
import { siteBanner } from "@db/schema";
import { bannerInputSchema, hkToday, isBannerLive } from "@contracts/banner";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";

/** 全站只有一條橫幅 */
const BANNER_ID = 1;

const EMPTY = { enabled: false, title: "", body: "", linkUrl: "", linkLabel: "", startDate: "", endDate: "", version: 0, updatedAt: null as Date | null };

async function readBanner() {
  const [row] = await getDb().select().from(siteBanner).where(eq(siteBanner.id, BANNER_ID)).limit(1);
  return row ?? null;
}

export const bannerRouter = createRouter({
  /** 公開：而家應該顯示嘅橫幅（關閉、未開始或者已過期 = null） */
  current: publicQuery.query(async () => {
    const b = await readBanner();
    if (!b || !isBannerLive(b, hkToday())) return null;
    return { title: b.title, body: b.body, linkUrl: b.linkUrl, linkLabel: b.linkLabel, version: b.version };
  }),

  /** 店主：讀取完整設定（未設定過就回傳預設值） */
  get: adminQuery.query(async () => {
    const b = await readBanner();
    if (!b) return EMPTY;
    const { enabled, title, body, linkUrl, linkLabel, startDate, endDate, version, updatedAt } = b;
    return { enabled, title, body, linkUrl, linkLabel, startDate, endDate, version, updatedAt: updatedAt as Date | null };
  }),

  /** 店主：儲存（每次 version + 1，訪客之前閂咗都會再見到新內容） */
  save: adminQuery.input(bannerInputSchema).mutation(async ({ ctx, input }) => {
    const prev = await readBanner();
    const version = (prev?.version ?? 0) + 1;
    const values = { ...input, version, updatedBy: ctx.user.id, updatedAt: new Date() };
    await getDb()
      .insert(siteBanner)
      .values({ id: BANNER_ID, ...values })
      .onConflictDoUpdate({ target: siteBanner.id, set: values });
    return { ok: true as const, version, live: isBannerLive(input, hkToday()) };
  }),
});

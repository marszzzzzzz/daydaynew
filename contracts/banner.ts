/**
 * 網站「最新宣傳」浮動橫幅（前後端共用，純函數）。
 * - 全站只有一條，由店主喺後台編輯
 * - 可以設開始／結束日期（香港時間，包首尾）；留空 = 冇限制
 * - 連結只准 http(s)、站內路徑（/ 開頭）、WhatsApp，防止 javascript: 之類嘅注入
 */
import { z } from "zod";

export const BANNER_TITLE_MAX = 40;
export const BANNER_BODY_MAX = 200;
export const BANNER_LABEL_MAX = 16;
const HK_TIMEZONE = "Asia/Hong_Kong";

export function isSafeLink(url: string): boolean {
  const u = url.trim();
  if (u.startsWith("/")) return !u.startsWith("//");
  return /^(https?:\/\/|whatsapp:\/\/)[^\s]+$/i.test(u);
}

/** 香港時間嘅今日（YYYY-MM-DD）；伺服器喺 UTC 都計得啱 */
export function hkToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HK_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type BannerContent = {
  enabled: boolean;
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  startDate: string;
  endDate: string;
};

export function isBannerLive(b: Pick<BannerContent, "enabled" | "startDate" | "endDate">, today: string): boolean {
  if (!b.enabled) return false;
  if (b.startDate && today < b.startDate) return false;
  if (b.endDate && today > b.endDate) return false;
  return true;
}

const dateOrEmpty = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式須為 YYYY-MM-DD")]);

export const bannerInputSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().max(BANNER_TITLE_MAX, `標題最多 ${BANNER_TITLE_MAX} 字`),
    body: z.string().trim().max(BANNER_BODY_MAX, `內容最多 ${BANNER_BODY_MAX} 字`),
    linkUrl: z.string().trim().max(500),
    linkLabel: z.string().trim().max(BANNER_LABEL_MAX, `按鈕文字最多 ${BANNER_LABEL_MAX} 字`),
    startDate: dateOrEmpty,
    endDate: dateOrEmpty,
  })
  .superRefine((b, ctx) => {
    if (b.enabled && !b.title) ctx.addIssue({ code: "custom", path: ["title"], message: "顯示橫幅要有標題" });
    if (b.linkUrl && !isSafeLink(b.linkUrl)) {
      ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "連結要以 https:// 或 / 開頭（例如 https://wa.me/852… 或 /login）" });
    }
    if (b.linkUrl && !b.linkLabel) ctx.addIssue({ code: "custom", path: ["linkLabel"], message: "有連結就要填按鈕文字" });
    if (b.startDate && b.endDate && b.endDate < b.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "結束日期唔可以早過開始日期" });
    }
  });
export type BannerInput = z.infer<typeof bannerInputSchema>;

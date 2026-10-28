/**
 * Facebook 專頁帖文 → 管理系統（前後端共用，純函數）。
 * - 規則整理（冇 AI key 都用得）：類型、格仔編號、價錢、摘要
 * - AI 整理結果一律經 sanitizeInsight 清理先儲存（唔信任模型輸出）
 */
import { z } from "zod";
import { allGridCodes } from "./gridLayout";

export const FB_POST_TYPES = ["rental", "tenant", "event", "product", "other"] as const;
export type FbPostType = (typeof FB_POST_TYPES)[number];
export const FB_TYPE_LABEL: Record<FbPostType, string> = { rental: "招租", tenant: "租戶公告", event: "活動", product: "新貨", other: "其他" };

export const FB_POST_STATUSES = ["new", "done", "ignored"] as const;
export type FbPostStatus = (typeof FB_POST_STATUSES)[number];

const SUMMARY_MAX = 200;
const RULE_SUMMARY_MAX = 80;
const PRODUCT_NAME_MAX = 60;
const PRODUCTS_MAX = 10;
const FOLLOW_UP_MAX = 100;
const FOLLOW_UPS_MAX = 5;

const VALID_CODES = new Set(allGridCodes());
const clip = (s: string, max: number) => [...s.trim()].slice(0, max).join("");

/** 「012格」「格仔 035」「#070」「第3格」→ ["003", "012", "035", "070"]（只保留存在嘅格） */
export function extractGridCodes(text: string): string[] {
  const found = new Set<string>();
  const patterns = [/(?<!\d)(\d{3})\s*號?格/g, /格仔?\s*(?:編號)?\s*#?(\d{3})(?!\d)/g, /#(\d{3})(?!\d)/g, /第\s*(\d{1,2})\s*格/g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.add(m[1].padStart(3, "0"));
  }
  return [...found].filter((c) => VALID_CODES.has(c)).sort();
}

/** 「$89」「HK$ 120.5」「15蚊」→ [89, 120.5, 15]（按出現次序） */
export function extractPrices(text: string): number[] {
  const hits: { at: number; value: number }[] = [];
  for (const m of text.matchAll(/(?:HK)?\$\s*(\d+(?:\.\d{1,2})?)/gi)) hits.push({ at: m.index, value: Number(m[1]) });
  for (const m of text.matchAll(/(\d+(?:\.\d{1,2})?)\s*(?:蚊|元)/g)) hits.push({ at: m.index, value: Number(m[1]) });
  return hits.sort((a, b) => a.at - b.at).map((h) => h.value);
}

const TYPE_KEYWORDS: [FbPostType, RegExp][] = [
  ["rental", /招租|租格|吉格|空格|格仔出租|免租/],
  ["tenant", /格主|租戶|租客|盤點|結數|交租|通知|公告/],
  ["product", /新貨|到貨|上架|新品|現貨|補貨|預訂|預購|\$\s*\d/],
  ["event", /市集|活動|優惠|限時|抽獎|工作坊|workshop|講座|聖誕|新年|中秋/i],
];

export function guessPostType(text: string): FbPostType {
  return TYPE_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export type FbInsight = {
  type: FbPostType;
  summary: string;
  gridCodes: string[];
  products: { name: string; price: number | null }[];
  /** YYYY-MM-DD 或 "" */
  eventStart: string;
  eventEnd: string;
  followUps: string[];
};

/** 冇 AI 時嘅整理：第一行做摘要；新貨帖只有一個價錢就當係嗰件貨嘅價 */
export function ruleInsight(message: string): FbInsight {
  const firstLine = message.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const type = guessPostType(message);
  const prices = extractPrices(message);
  return {
    type,
    summary: firstLine ? clip(firstLine, RULE_SUMMARY_MAX) : "（冇文字）",
    gridCodes: extractGridCodes(message),
    products: type === "product" && prices.length === 1 && firstLine ? [{ name: clip(firstLine, PRODUCT_NAME_MAX), price: prices[0] }] : [],
    eventStart: "",
    eventEnd: "",
    followUps: [],
  };
}

/** 結構化輸出用嘅 schema（唔加長度限制，交俾 sanitizeInsight 處理） */
export const aiInsightSchema = z.object({
  type: z.enum(FB_POST_TYPES),
  summary: z.string(),
  gridCodes: z.array(z.string()),
  products: z.array(z.object({ name: z.string(), price: z.number().nullable() })),
  eventStart: z.string(),
  eventEnd: z.string(),
  followUps: z.array(z.string()),
});

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function sanitizeInsight(raw: z.infer<typeof aiInsightSchema>): FbInsight {
  let start = isDate(raw.eventStart) ? raw.eventStart : "";
  let end = isDate(raw.eventEnd) ? raw.eventEnd : "";
  if (start && end && end < start) [start, end] = [end, start];
  return {
    type: FB_POST_TYPES.includes(raw.type) ? raw.type : "other",
    summary: clip(raw.summary, SUMMARY_MAX),
    gridCodes: [...new Set(raw.gridCodes.map((c) => c.trim().padStart(3, "0")))].filter((c) => VALID_CODES.has(c)).sort(),
    products: raw.products
      .map((p) => ({ name: clip(p.name, PRODUCT_NAME_MAX), price: p.price !== null && Number.isFinite(p.price) && p.price >= 0 ? p.price : null }))
      .filter((p) => p.name)
      .slice(0, PRODUCTS_MAX),
    eventStart: start,
    eventEnd: end,
    followUps: raw.followUps.map((f) => clip(f, FOLLOW_UP_MAX)).filter(Boolean).slice(0, FOLLOW_UPS_MAX),
  };
}

/** Graph API GET /{page-id}/posts 回應（只驗證用到嘅欄位） */
export const graphPostsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      message: z.string().optional(),
      created_time: z.string(),
      permalink_url: z.string().optional(),
      full_picture: z.string().optional(),
    }),
  ),
  paging: z.object({ next: z.string().optional() }).optional(),
});
export type GraphPost = z.infer<typeof graphPostsSchema>["data"][number];

/** 下載帖文相片只准 Facebook CDN（防止伺服器被利用去讀內部網址）；extraOrigins 只係本機測試用 */
export function isAllowedImageHost(url: string, extraOrigins: string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (extraOrigins.includes(u.origin)) return true;
  return u.protocol === "https:" && (u.hostname === "fbcdn.net" || u.hostname.endsWith(".fbcdn.net"));
}

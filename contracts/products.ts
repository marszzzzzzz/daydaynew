/**
 * 首頁商品輪播 + 商品 SEO（前後端共用，純函數）。
 * - 貨品以 POS 名（sales.productName）做識別；店主可以另設對外顯示嘅 SEO 名、描述、關鍵字、相片
 * - SEO 名只用喺公開頁面（首頁輪播、JSON-LD、llms.txt），唔會改到銷售記錄
 */
import { z } from "zod";

export const PRODUCT_NAME_MAX = 60;
export const PRODUCT_DESC_MAX = 160;
export const PRODUCT_KEYWORDS_MAX = 120;
export const PRODUCT_CATEGORY_MAX = 30;
export const PRODUCT_PRICE_MAX = 1_000_000;
/** 相片解碼後上限；前端會先壓縮到大約 800px WebP */
export const IMAGE_MAX_BYTES = 400_000;

/** 搜尋結果標題建議長度（中英混合字數） */
const NAME_MIN = 8;
const NAME_MAX_GOOD = 40;
const DESC_MIN = 30;
const KEYWORDS_MIN = 2;

const len = (s: string) => [...s].length;

export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  for (const k of raw.split(/[,，、\n]/)) {
    const t = k.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

export function publicName(p: { sourceName: string; displayName: string }): string {
  return p.displayName.trim() || p.sourceName;
}

export type SeoInput = { sourceName: string; displayName: string; description: string; keywords: string; hasImage: boolean };
export type SeoCheck = { id: string; ok: boolean; label: string; hint: string };

/** 逐項檢查（SEO 搜尋排名 / SEM 關鍵字 / GEO、AEO 俾 AI 引用嘅描述） */
export function seoChecks(p: SeoInput): SeoCheck[] {
  const name = publicName(p);
  const desc = p.description.trim();
  const keywords = parseKeywords(p.keywords);
  const lower = (s: string) => s.toLowerCase();
  const mentions = (text: string) => keywords.some((k) => lower(text).includes(lower(k)));
  return [
    { id: "customName", ok: !!p.displayName.trim() && p.displayName.trim() !== p.sourceName, label: "已設定對外名稱", hint: "POS 名通常太簡短，客人搜唔到；寫清楚品牌、款式、容量" },
    { id: "nameLength", ok: len(name) >= NAME_MIN && len(name) <= NAME_MAX_GOOD, label: `名稱 ${NAME_MIN}–${NAME_MAX_GOOD} 字`, hint: "太短資料唔夠，太長搜尋結果會被截斷" },
    { id: "keywords", ok: keywords.length >= KEYWORDS_MIN, label: `最少 ${KEYWORDS_MIN} 個關鍵字`, hint: "客人會打嘅字，例如「保鮮盒」「北角」「生日禮物」" },
    { id: "nameKeyword", ok: keywords.length > 0 && mentions(name), label: "名稱包含關鍵字", hint: "最重要嘅關鍵字要喺名稱出現" },
    { id: "description", ok: len(desc) >= DESC_MIN && len(desc) <= PRODUCT_DESC_MAX, label: `描述 ${DESC_MIN}–${PRODUCT_DESC_MAX} 字`, hint: "一兩句講清楚係乜、適合邊個、喺邊度買到 —— AI 搜尋會直接引用" },
    { id: "descKeyword", ok: keywords.length > 0 && mentions(desc), label: "描述包含關鍵字", hint: "描述入面自然咁提到關鍵字" },
    { id: "image", ok: p.hasImage, label: "有商品相", hint: "有相嘅貨品喺輪播同 Google 圖片搜尋都會顯示得更好" },
  ];
}

export function seoScore(p: SeoInput): number {
  const checks = seoChecks(p);
  return Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
}

const text = (max: number, label: string) => z.string().trim().max(max, `${label}最多 ${max} 字`);

export const productInputSchema = z
  .object({
    sourceName: z.string().trim().min(1, "缺少貨品名稱").max(200),
    displayName: text(PRODUCT_NAME_MAX, "對外名稱"),
    description: text(PRODUCT_DESC_MAX, "描述"),
    keywords: text(PRODUCT_KEYWORDS_MAX, "關鍵字"),
    category: text(PRODUCT_CATEGORY_MAX, "分類"),
    /** 對外售價；null = 用 POS 最近售價；唔傳 = 唔改 */
    listPrice: z.number().min(0, "售價唔可以係負數").max(PRODUCT_PRICE_MAX).nullable().optional(),
    featured: z.boolean(),
    hidden: z.boolean(),
  })
  .refine((p) => !(p.featured && p.hidden), { message: "隱藏咗嘅貨品唔可以同時做精選", path: ["hidden"] });

export type ProductInput = z.infer<typeof productInputSchema>;

/** 只接受 WebP / JPEG / PNG（SVG 可以藏 script，唔收） */
export function isImageDataUrl(s: string): boolean {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+=*)$/.exec(s);
  if (!m) return false;
  const bytes = Math.floor((m[2].length * 3) / 4);
  return bytes <= IMAGE_MAX_BYTES;
}

export type ShowcaseCard = { name: string; description: string; category: string; price: string | null; imageUrl: string | null };

/** 放入 <script type="application/ld+json">：將 < 轉義，名稱入面有 </script> 都唔會爆出嚟 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** schema.org ItemList（Google 結構化資料 + AI 搜尋引擎讀得明） */
export function showcaseJsonLd(items: ShowcaseCard[], origin: string) {
  const abs = (url: string) => (url.startsWith("/") ? origin + url : url);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "日日新格仔鋪 店內精選及熱銷貨品",
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        ...(p.description && { description: p.description }),
        ...(p.category && { category: p.category }),
        ...(p.imageUrl && { image: abs(p.imageUrl) }),
        ...(p.price && {
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: "HKD",
            availability: "https://schema.org/InStock",
            seller: { "@type": "Store", name: "日日新格仔鋪 DayDayNew.HK" },
          },
        }),
      },
    })),
  };
}

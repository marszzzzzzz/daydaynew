import { graphPostsSchema, isAllowedImageHost, type GraphPost } from "@contracts/facebook";
import { IMAGE_MAX_BYTES } from "@contracts/products";
import { env } from "../lib/env";

const POST_FIELDS = "id,message,created_time,permalink_url,full_picture";
const PAGE_SIZE = 25;
const REQUEST_TIMEOUT_MS = 10_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 俾店主睇得明嘅錯誤（唔會包含權杖） */
export class FacebookError extends Error {}

export const isFacebookConfigured = () => !!env.fbPageId && !!env.fbPageToken;

/** Graph API 錯誤碼 → 中文說明（https://developers.facebook.com/docs/graph-api/guides/error-handling） */
function explain(code: number | undefined, status: number): string {
  if (code === 190) return "Facebook 權杖已過期或者無效，請按後台教學重新攞一個長期專頁權杖，再更新 FB_PAGE_TOKEN";
  if (code === 10 || code === 200 || code === 100) return "權限唔夠或者專頁 id 唔啱：要用專頁權杖，並有 pages_read_engagement 權限";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "Facebook 暫時限制咗讀取次數，請過一陣再試";
  return `Facebook 回應錯誤（HTTP ${status}），請稍後再試`;
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new FacebookError("連唔到 Facebook，請稍後再試");
  }
  const body = (await res.json().catch(() => null)) as { error?: { code?: number } } | null;
  if (!res.ok || body?.error) throw new FacebookError(explain(body?.error?.code, res.status));
  return body;
}

/** 一頁帖文（新到舊）；next 只會跟同一個 Graph API 網址 */
export async function fetchPostsPage(next?: string): Promise<{ posts: GraphPost[]; next?: string }> {
  const base = env.fbGraphBase.replace(/\/$/, "");
  const url =
    next ??
    `${base}/${env.fbGraphVersion}/${encodeURIComponent(env.fbPageId)}/posts?` +
      new URLSearchParams({ fields: POST_FIELDS, limit: String(PAGE_SIZE), access_token: env.fbPageToken });
  const parsed = graphPostsSchema.safeParse(await getJson(url));
  if (!parsed.success) throw new FacebookError("Facebook 回傳嘅資料格式唔啱");
  const nextUrl = parsed.data.paging?.next;
  return { posts: parsed.data.data, next: nextUrl?.startsWith(base + "/") ? nextUrl : undefined };
}

/** 下載帖文相片做商品相（只准 Facebook CDN、唔跟轉址、限大小同格式） */
export async function downloadImage(url: string): Promise<string> {
  const extra = env.fbGraphBase.startsWith("https://graph.facebook.com") ? [] : [new URL(env.fbGraphBase).origin];
  if (!isAllowedImageHost(url, extra)) throw new FacebookError("呢張相唔係來自 Facebook，唔會下載");
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new FacebookError("下載唔到帖文相片，請喺商品 SEO 自己上載");
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !IMAGE_TYPES.has(type)) throw new FacebookError("帖文相片格式唔支援，請喺商品 SEO 自己上載");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > IMAGE_MAX_BYTES) throw new FacebookError("帖文相片太大，請喺商品 SEO 自己上載（會自動壓縮）");
  return `data:${type};base64,${bytes.toString("base64")}`;
}

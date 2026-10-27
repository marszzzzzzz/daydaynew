import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { ensureDb } from "./bootstrap";
import { initDb } from "./queries/connection";
import { readImage } from "./queries/products";
import { buildLlmsTxt } from "./llmsTxt";

const IMAGE_CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const IMAGE_CACHE_SHORT = "public, max-age=300";
const LLMS_CACHE = "public, max-age=600";

/**
 * Hono app（只有 /api 路由，唔會 listen）：
 * - 本機：server/boot.ts 加靜態檔 + listen
 * - Vercel：api/index.ts 包成 Vercel Function，前端由 Vercel CDN 派
 */
export const app = new Hono();

// 第一個請求先連 DB + 建表（idempotent）；之後每個請求直接用
let ready: Promise<void> | null = null;
const dbReady: MiddlewareHandler = async (_c, next) => {
  ready ??= initDb().then(async () => {
    await ensureDb();
  });
  try {
    await ready;
  } catch (e) {
    ready = null; // 下次請求再試
    throw e;
  }
  await next();
};
app.use("/api/*", dbReady);
app.use("/llms.txt", dbReady);

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  }),
);

// 商品相：網址帶 ?v=版本，版本啱就可以畀瀏覽器 / CDN 長期快取
app.get("/api/products/:id/image", async (c) => {
  const id = Number(c.req.param("id"));
  const img = Number.isInteger(id) && id > 0 ? await readImage(id) : null;
  const m = img && /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(img.dataUrl);
  if (!img || !m) return c.json({ error: "Not Found" }, 404);
  const cache = c.req.query("v") === String(img.version) ? IMAGE_CACHE_IMMUTABLE : IMAGE_CACHE_SHORT;
  return c.body(Buffer.from(m[2], "base64"), 200, { "content-type": m[1], "cache-control": cache, "x-content-type-options": "nosniff" });
});

// AI 搜尋用嘅店舖簡介（Vercel 將 /llms.txt 轉入呢個 function）
app.get("/llms.txt", async (c) => {
  const url = new URL(c.req.url);
  const origin = `${c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${c.req.header("host") ?? url.host}`;
  const body = await buildLlmsTxt(origin);
  return c.text(body, 200, { "cache-control": LLMS_CACHE });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// 任何未處理錯誤（例如數據庫連唔到）都回 JSON 中文訊息，前端先讀得明
app.onError((err, c) => {
  console.error("[api]", err);
  return c.json({ error: { json: { message: "伺服器暫時連唔到資料庫，請稍後再試", code: -32603, data: { code: "INTERNAL_SERVER_ERROR" } } } }, 500);
});

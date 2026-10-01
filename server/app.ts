import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { ensureDb } from "./bootstrap";
import { initDb } from "./queries/connection";

/**
 * Hono app（只有 /api 路由，唔會 listen）：
 * - 本機：server/boot.ts 加靜態檔 + listen
 * - Vercel：api/index.ts 包成 Vercel Function，前端由 Vercel CDN 派
 */
export const app = new Hono();

// 第一個請求先連 DB + 建表（idempotent）；之後每個請求直接用
let ready: Promise<void> | null = null;
app.use("/api/*", async (_c, next) => {
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
});

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  }),
);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// 任何未處理錯誤（例如數據庫連唔到）都回 JSON 中文訊息，前端先讀得明
app.onError((err, c) => {
  console.error("[api]", err);
  return c.json({ error: { json: { message: "伺服器暫時連唔到資料庫，請稍後再試", code: -32603, data: { code: "INTERNAL_SERVER_ERROR" } } } }, 500);
});

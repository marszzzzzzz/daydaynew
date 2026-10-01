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

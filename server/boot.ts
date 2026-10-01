import { app } from "./app";
import { env } from "./lib/env";
import { bootstrapDb } from "./bootstrap";
import { initDb } from "./queries/connection";

// 本機 / Docker 入口（Vercel 用 api/index.ts）
await initDb();
bootstrapDb();

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "4100");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

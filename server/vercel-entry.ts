import { getRequestListener } from "@hono/node-server";
import { app } from "./app";

/** Vercel Function 入口（由 scripts/build-vercel.mjs 打包成 .vercel/output/functions/api.func） */
export default getRequestListener(app.fetch);

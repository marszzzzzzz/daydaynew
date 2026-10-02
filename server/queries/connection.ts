import path from "node:path";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

/**
 * 資料庫連線：
 * - 有 DATABASE_URL → 連 Supabase Postgres（正式環境必須），用 node-postgres（pg）連線池
 *   注意：唔好用 postgres-js —— 佢會將平行查詢「pipeline」喺同一條連線，
 *   Supabase transaction pooler（6543）會因此卡死，請求等到 Vercel 30 秒超時。
 *   pg 每條連線一次只行一條查詢，平行查詢會排隊或者用另一條連線，唔會卡。
 * - 冇 DATABASE_URL（只限本機開發 / 測試）→ 用 PGlite（嵌入式 Postgres），數據存喺 data/pglite
 */
type Db = ReturnType<typeof drizzleNodePg<typeof fullSchema>>;

let instance: Db | null = null;
let rawExec: ((sql: string) => Promise<unknown>) | null = null;
let closeFn: (() => Promise<void>) | null = null;
export let dbDriver: "postgres" | "pglite" | null = null;

export async function initDb(): Promise<void> {
  if (instance) return;

  if (env.databaseUrl) {
    const { default: pg } = await import("pg");
    const local = /localhost|127\.0\.0\.1/.test(env.databaseUrl);
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      // Vercel 每個 function instance 開少量連線（Supabase pooler 負責共用）
      max: process.env.VERCEL ? 5 : 10,
      idleTimeoutMillis: 20_000, // 閒置 20 秒自動斷開，避免用到已經被 pooler 斷咗嘅連線
      connectionTimeoutMillis: 10_000,
      // 單條查詢最長 15 秒，唔會拖到 Vercel 30 秒超時
      query_timeout: 15_000,
      ssl: local ? false : { rejectUnauthorized: false },
    });
    pool.on("error", (e) => console.warn("[db] idle client error:", e.message));
    instance = drizzleNodePg(pool, { schema: fullSchema });
    rawExec = (sql) => pool.query(sql);
    closeFn = () => pool.end();
    dbDriver = "postgres";
    return;
  }

  if (env.isProduction && !env.pgliteDir) {
    // 正式環境一定要連 Supabase；只有明確設定 PGLITE_DIR（本機測試 build）先准用 PGlite
    throw new Error("Missing DATABASE_URL — 正式環境必須設定 Supabase 連線字串");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = env.pgliteDir || path.join(process.cwd(), "data", "pglite");
  const client = dir === "memory://" ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  // PGlite 同 postgres-js 嘅 query API 一樣，型別上當同一種用
  instance = drizzlePglite(client, { schema: fullSchema }) as unknown as Db;
  rawExec = (sql) => client.exec(sql);
  closeFn = () => client.close();
  dbDriver = "pglite";
  console.log(`[db] DATABASE_URL 未設定，本機開發改用 PGlite（${dir}）`);
}

export function getDb(): Db {
  if (!instance) throw new Error("DB not initialized — call initDb() first");
  return instance;
}

/** 行原始 SQL（畀 bootstrap 行 DDL 用） */
export async function execRaw(sql: string): Promise<void> {
  if (!rawExec) throw new Error("DB not initialized — call initDb() first");
  await rawExec(sql);
}

export async function closeDb(): Promise<void> {
  await closeFn?.();
  instance = null;
  rawExec = null;
  closeFn = null;
}

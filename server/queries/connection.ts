import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

/**
 * 資料庫連線：
 * - 有 DATABASE_URL → 連 Supabase Postgres（正式環境必須）
 * - 冇 DATABASE_URL（只限本機開發 / 測試）→ 用 PGlite（嵌入式 Postgres），數據存喺 data/pglite
 *   同 Supabase 係同一套 SQL，本機測得過嘅，上 Supabase 一樣行得
 */
type Db = ReturnType<typeof drizzlePg<typeof fullSchema>>;

let instance: Db | null = null;
let rawExec: ((sql: string) => Promise<unknown>) | null = null;
let closeFn: (() => Promise<void>) | null = null;
export let dbDriver: "postgres" | "pglite" | null = null;

export async function initDb(): Promise<void> {
  if (instance) return;

  if (env.databaseUrl) {
    const { default: postgres } = await import("postgres");
    // Supabase pooler（6543，transaction mode）唔支援 prepared statement
    const client = postgres(env.databaseUrl, {
      prepare: false,
      // Vercel 每個 function instance 開少量連線（Supabase pooler 負責共用）
      max: process.env.VERCEL ? 3 : 10,
      idle_timeout: 20, // 閒置 20 秒自動斷開，避免用到已經被 pooler 斷咗嘅連線
      max_lifetime: 60 * 5,
      connect_timeout: 10,
      // 單條查詢最長 15 秒，唔會拖到 Vercel 30 秒超時
      connection: { statement_timeout: 15000 },
      ssl: /localhost|127\.0\.0\.1/.test(env.databaseUrl) ? false : "require",
      onnotice: () => {},
    });
    instance = drizzlePg(client, { schema: fullSchema });
    rawExec = (sql) => client.unsafe(sql);
    closeFn = () => client.end({ timeout: 5 });
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

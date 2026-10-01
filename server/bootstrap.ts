import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb, execRaw, dbDriver } from "./queries/connection";
import { DDL } from "../db/ddl";
import { ALL_TABLES } from "../db/schema";
import { ensureOwnerFromEnv, seedIfEmpty } from "../db/seed-lib";
import { env } from "./lib/env";

export const DB_ERROR_RE =
  /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|does not exist|password authentication failed|Connection terminated|too many clients|DB not initialized/i;

/** 抽出 Drizzle 包裝底下嘅真正錯誤 */
export function rootCause(e: unknown): string {
  let cur = e as { message?: string; cause?: unknown; code?: string } | null;
  let out = String(cur?.message ?? e ?? "unknown");
  for (let depth = 0; depth < 5 && cur?.cause; depth++) {
    cur = cur.cause as typeof cur;
    if (cur?.message) out = cur.code ? `${cur.code}: ${cur.message}` : cur.message;
  }
  return out.replace(/\s+/g, " ").slice(0, 160);
}

/** DB 操作包裝：連線類錯誤時觸發自我修復並重試一次；仍失敗就回乾淨訊息（附根因） */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TRPCError || !DB_ERROR_RE.test(rootCause(e))) throw e;
    ready = false;
    const ok = await ensureDb();
    if (!ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `資料庫連線失敗，請稍後再試（${lastError ?? "連接中"}）`,
      });
    }
    return fn();
  }
}

let ready = false;
let running: Promise<boolean> | null = null;
let lastError: string | null = null;
let readyAt: Date | null = null;

async function runOnce(): Promise<boolean> {
  try {
    for (const ddl of DDL) await execRaw(ddl);
    const db = getDb();
    await ensureOwnerFromEnv(db);
    await seedIfEmpty(db);
    ready = true;
    readyAt = new Date();
    lastError = null;
    console.log(`[bootstrap] database ready (${dbDriver}, demoMode=${env.demoMode})`);
    return true;
  } catch (e) {
    lastError = rootCause(e);
    console.warn("[bootstrap] not ready:", lastError);
    return false;
  }
}

/** 去重執行：已成功直接返回；進行中返回同一 promise */
export function ensureDb(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  running ??= runOnce().finally(() => {
    running = null;
  });
  return running;
}

/** server 啟動時背景重試（頭 1 分鐘每 5 秒，之後每 30 秒） */
export function bootstrapDb() {
  void (async () => {
    for (let attempt = 1; !ready; attempt++) {
      await ensureDb();
      if (!ready) await new Promise((r) => setTimeout(r, attempt <= 12 ? 5000 : 30000));
    }
  })();
}

/** 健康檢查：連線 + 各表行數（唔會暴露任何個人資料） */
export async function dbStatus() {
  if (!ready) await ensureDb();
  if (!ready) {
    return { ok: false as const, ready: false as const, driver: dbDriver, error: lastError ?? "database not reachable yet" };
  }
  try {
    const counts: Record<string, number> = {};
    for (const table of ALL_TABLES) {
      const res: unknown = await getDb().execute(sql.raw(`SELECT COUNT(*)::int AS c FROM gridbox.${table}`));
      // postgres-js 回傳 array；PGlite 回傳 { rows }
      const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { c: number }[];
      counts[table] = Number(rows[0]?.c ?? 0);
    }
    return { ok: true as const, ready: true as const, driver: dbDriver, demoMode: env.demoMode, readyAt, counts };
  } catch (e) {
    return { ok: false as const, ready: false as const, driver: dbDriver, error: rootCause(e) };
  }
}

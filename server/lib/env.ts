import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";

function sessionSecret(): string {
  const value = process.env.SESSION_SECRET || process.env.APP_SECRET || "";
  if (value.length >= 32) return value;
  if (isProduction) {
    throw new Error("SESSION_SECRET 未設定或太短（最少 32 個字符）— 用 `openssl rand -hex 32` 生成一個");
  }
  // 本機開發專用；正式環境一定要自己設
  return "dev-only-session-secret-change-me-0123456789";
}

export const env = {
  isProduction,
  /** Supabase Postgres 連線字串（Project Settings → Database → Connection string） */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** 本機開發冇 DATABASE_URL 時，PGlite 數據目錄；"memory://" = 只存記憶體（測試用） */
  pgliteDir: process.env.PGLITE_DIR ?? "",
  /** 簽 session JWT 用 */
  sessionSecret: sessionSecret(),
  /** 店主戶口：開機時如果未有店主，就用呢組資料建立（之後可以刪走呢兩個環境變數） */
  ownerUsername: process.env.OWNER_USERNAME ?? "",
  ownerPassword: process.env.OWNER_PASSWORD ?? "",
  ownerName: process.env.OWNER_NAME ?? "店主",
  /** 示範模式：開放 Demo 一撳登入 + 自動生成示範資料。正式開舖要設做 false（預設 false） */
  demoMode: process.env.DEMO_MODE === "true",
};

/**
 * 建立 / 重設店主戶口：
 *   npm run owner:create -- <用戶名> <密碼> [顯示名稱]
 * 會用 .env 入面嘅 DATABASE_URL（冇就用本機 PGlite）。
 */
import { initDb, getDb, execRaw, closeDb } from "../server/queries/connection";
import { DDL } from "./ddl";
import { upsertOwner } from "./seed-lib";

const [username, password, name = "店主"] = process.argv.slice(2);
if (!username || !password) {
  console.error("用法：npm run owner:create -- <用戶名> <密碼> [顯示名稱]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("密碼最少 8 個字符");
  process.exit(1);
}

await initDb();
for (const ddl of DDL) await execRaw(ddl);
const result = await upsertOwner(getDb(), { username, password, name }, true);
console.log(`店主戶口「${username}」${result === "created" ? "已建立" : "已設為店主並重設密碼"}`);
await closeDb();
process.exit(0);

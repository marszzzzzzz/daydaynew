// 將環境變數設定到已連結嘅 Vercel 項目（production + preview）：npm run vercel:env
// - DATABASE_URL：由本機 .env 讀，經 stdin 傳俾 vercel CLI（唔會印出嚟），存做 Sensitive
// - SESSION_SECRET：為 Vercel 另外生成一個新嘅（同本機唔同），存做 Sensitive
// - DEMO_MODE=false
// 已存在嘅變數會覆蓋（--force）
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const local = dotenv.parse(fs.readFileSync(".env"));
if (!local.DATABASE_URL) {
  console.error("✗ .env 入面冇 DATABASE_URL，請先行 npm run setup");
  process.exit(1);
}

const vars = [
  { name: "DATABASE_URL", value: local.DATABASE_URL, sensitive: true },
  { name: "SESSION_SECRET", value: crypto.randomBytes(32).toString("hex"), sensitive: true },
  { name: "DEMO_MODE", value: "false", sensitive: false },
];

let failed = 0;
for (const target of ["production", "preview"]) {
  for (const v of vars) {
    const args = ["env", "add", v.name, target, "--force", "--yes", v.sensitive ? "--sensitive" : "--no-sensitive"];
    const r = spawnSync("vercel", args, { input: v.value, encoding: "utf8" });
    const ok = r.status === 0;
    if (!ok) failed++;
    // 只印結果，唔印數值
    console.log(`${ok ? "✓" : "✗"} ${v.name} → ${target}${ok ? "" : `：${(r.stderr || r.stdout).split("\n").filter(Boolean).pop()}`}`);
  }
}
process.exit(failed ? 1 : 0);

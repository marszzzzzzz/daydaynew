// 互動式設定 .env：npm run setup
// - 問 Supabase 資料庫密碼（輸入時唔顯示）→ 自動搵啱嘅 Connection pooler 並測試連線
// - 自動生成 SESSION_SECRET
// - 問店主用戶名 / 密碼
// 密碼只會寫入本機 app/.env（.gitignore 已排除，唔會上 GitHub）
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";
import postgres from "postgres";

const PROJECT_REF = "gndrrgqihsbweocoedvp"; // Supabase 項目 DDN
const REGION = "ap-southeast-1";
const POOLER_HOSTS = [`aws-0-${REGION}.pooler.supabase.com`, `aws-1-${REGION}.pooler.supabase.com`];

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
        else rl.output.write("*".repeat(s.length));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function tryConnect(url) {
  const sql = postgres(url, { prepare: false, ssl: "require", max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const [row] = await sql`select current_user as u, version() as v`;
    return { ok: true, info: `${row.u} · ${String(row.v).split(" ").slice(0, 2).join(" ")}` };
  } catch (e) {
    return { ok: false, error: e.code ? `${e.code}: ${e.message}` : e.message };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

console.log("\n格仔鋪 · 設定 Supabase 連線（項目 DDN）\n");

if (fs.existsSync(".env")) {
  const again = await ask("已經有 .env，要覆蓋嗎？(y/N) ");
  if (again.toLowerCase() !== "y") process.exit(0);
}

let databaseUrl = "";
for (let attempt = 1; attempt <= 3 && !databaseUrl; attempt++) {
  const pw = await ask("Supabase 資料庫密碼：", { hidden: true });
  if (!pw) continue;
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(pw)}@${host}:6543/postgres`;
    process.stdout.write(`  試緊 ${host} … `);
    const r = await tryConnect(url);
    if (r.ok) {
      console.log(`✓ 連線成功（${r.info}）`);
      databaseUrl = url;
      break;
    }
    console.log(`✗ ${r.error}`);
    if (/password authentication failed/i.test(r.error)) break; // host 啱但密碼錯，唔使再試其他 host
  }
  if (!databaseUrl) console.log("  連唔到，請再試（檢查密碼，或者喺 Supabase → Database → Settings 重設密碼）\n");
}
if (!databaseUrl) {
  console.log("\n三次都連唔到，已停止。冇寫入 .env。");
  process.exit(1);
}

console.log("\n店主戶口（開機時自動建立，已有店主就略過）");
let ownerUser = "";
while (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(ownerUser) || ownerUser.toLowerCase().startsWith("demo-")) {
  ownerUser = await ask("店主用戶名（3–32 字，中英文 / 數字 / _ . -）：");
}
let ownerPw = "";
while (ownerPw.length < 8) {
  ownerPw = await ask("店主密碼（最少 8 個字符）：", { hidden: true });
  if (ownerPw.length >= 8) {
    const again = await ask("再輸入一次店主密碼：", { hidden: true });
    if (again !== ownerPw) {
      console.log("兩次唔一樣，再嚟過");
      ownerPw = "";
    }
  }
}
const ownerName = (await ask("店主顯示名稱（Enter = 店主）：")) || "店主";

const env = `# 由 npm run setup 生成 — 唔好上載呢個檔案
DATABASE_URL=${databaseUrl}
SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}
OWNER_USERNAME=${ownerUser}
OWNER_PASSWORD=${ownerPw}
OWNER_NAME=${ownerName}
DEMO_MODE=false
`;
fs.writeFileSync(".env", env, { mode: 0o600 });
console.log("\n✓ 已寫入 app/.env（只有你嘅電腦帳戶讀到）");
console.log("下一步：npm run build && npm start，然後開 http://localhost:4100/api/trpc/shop.dbHealth\n");

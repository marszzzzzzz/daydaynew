// 備份 Supabase gridbox 資料庫：npm run db:backup
// - 只讀：逐張表 SELECT，唔會改任何資料
// - 輸出去 backups/gridbox-YYYYMMDD-HHMMSS/（已 .gitignore，唔會上 GitHub —— 入面有密碼雜湊同租戶資料）
//   · restore.sql：可以直接貼入 Supabase SQL Editor 還原（先清空 gridbox 表再插入，包喺一個 transaction）
//   · <table>.json：每張表一個檔，方便查閱
//   · manifest.json：備份時間、每張表行數、SHA-256
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "dotenv/config";
import pg from "pg";

// 次序跟外鍵：先父後子（還原時按呢個次序插入）
const TABLES = ["users", "tenants", "grids", "leases", "sales", "rent_records", "employees", "shifts", "payroll_payments", "attendance"];

if (!process.env.DATABASE_URL) {
  console.error("✗ .env 入面冇 DATABASE_URL，請先行 npm run setup");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const dir = path.join("backups", `gridbox-${stamp}`);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const manifest = { createdAt: new Date().toISOString(), schema: "gridbox", tables: {} };
const sql = [
  `-- 格仔鋪 gridbox 備份 ${manifest.createdAt}`,
  "-- 還原：貼入 Supabase SQL Editor 執行（會先清空 gridbox 全部表）",
  "BEGIN;",
  `TRUNCATE ${TABLES.map((t) => `gridbox.${t}`).join(", ")} RESTART IDENTITY;`,
];

try {
  // 新功能嘅表喺 server 開機後先會建立；未存在就略過（唔當失敗）
  const { rows: existing } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'gridbox'`);
  const have = new Set(existing.map((r) => r.table_name));
  const present = TABLES.filter((t) => have.has(t));
  for (const t of TABLES.filter((x) => !have.has(x))) console.log(`  – ${t.padEnd(17)} 未建立，略過`);
  sql[3] = `TRUNCATE ${present.map((t) => `gridbox.${t}`).join(", ")} RESTART IDENTITY;`;
  for (const t of present) {
    // 一條連線逐張表讀，唔會平行
    const { rows, fields } = await pool.query(`SELECT * FROM gridbox.${t} ORDER BY id`);
    const json = JSON.stringify(rows, null, 2);
    fs.writeFileSync(path.join(dir, `${t}.json`), json, { mode: 0o600 });
    manifest.tables[t] = { rows: rows.length, sha256: crypto.createHash("sha256").update(json).digest("hex") };
    if (rows.length) {
      const cols = fields.map((f) => `"${f.name}"`).join(", ");
      for (let i = 0; i < rows.length; i += 200) {
        const values = rows.slice(i, i + 200).map((r) => `(${fields.map((f) => lit(r[f.name])).join(", ")})`).join(",\n  ");
        sql.push(`INSERT INTO gridbox.${t} (${cols}) VALUES\n  ${values};`);
      }
      // serial 序號接返最大 id，之後新增唔會撞
      sql.push(`SELECT setval(pg_get_serial_sequence('gridbox.${t}', 'id'), (SELECT MAX(id) FROM gridbox.${t}));`);
    }
    console.log(`  ✓ ${t.padEnd(17)} ${rows.length} 行`);
  }
  sql.push("COMMIT;");
  fs.writeFileSync(path.join(dir, "restore.sql"), sql.join("\n") + "\n", { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  const total = Object.values(manifest.tables).reduce((a, x) => a + x.rows, 0);
  console.log(`\n✓ 備份完成：${dir}（${Object.keys(manifest.tables).length} 張表，共 ${total} 行）`);
} catch (e) {
  console.error("✗ 備份失敗：", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

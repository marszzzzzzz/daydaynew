import { sql, eq, and, like, inArray, notLike } from "drizzle-orm";
import { users, grids, tenants, leases, sales, rentRecords } from "./schema";
import { allGridCodes, gridSizeOf, gridRentOf } from "@contracts/gridLayout";
import { hashPassword } from "../api/password";
import { env } from "../api/lib/env";

type Db = ReturnType<typeof import("../api/queries/connection").getDb>;

/** Demo 戶口（登入頁一撳試用）；註冊計數會排除 local:demo-% */
export const DEMO_OWNER = { username: "demo-owner", password: "demo1234", name: "店主 Demo" } as const;
export const DEMO_TENANT = { username: "demo-tenant", password: "demo1234", name: "租戶 Demo" } as const;
export const DEMO_TENANT_LINK_NAME = "【示範】陳小彤"; // demo-tenant 連結嘅租戶檔案

export const DEMO_PREFIX = "【示範】";

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * 建立 70 個格仔（10 排 × 7，編號 001–070；第 3、4 排大格）。已存在嘅編號會跳過。
 * 回傳新增數量。
 */
export async function ensureGridLayout(db: Db): Promise<number> {
  const existing = await db.select({ code: grids.code }).from(grids);
  const have = new Set(existing.map((g) => g.code));
  const rows = allGridCodes()
    .filter((code) => !have.has(code))
    .map((code) => ({
      code,
      size: gridSizeOf(code) as "M" | "L",
      monthlyRent: gridRentOf(code).toFixed(2),
      status: "vacant" as const,
    }));
  if (rows.length) await db.insert(grids).values(rows);
  return rows.length;
}

/**
 * 示範營業資料：4 個【示範】租戶 + 租約 + 近 40 日銷售 + 租金按金記錄。
 * 租約落喺 017（大格）、002、036（中格）、026（大格）；010、013 標記已預留。
 * 按金 = 一個月月租（同宣傳頁文案一致）。
 * 可重複執行嘅前提：先 clearDemoBusiness 或資料庫為空。
 */
export async function seedDemoBusiness(db: Db): Promise<{ tenants: number; leases: number; sales: number; rent: number }> {
  const allGrids = await db.select().from(grids);
  const byCode = Object.fromEntries(allGrids.map((g) => [g.code, g]));
  const need = ["017", "002", "026", "036", "010", "013"];
  for (const code of need) {
    if (!byCode[code]) throw new Error(`缺少格仔 ${code}，請先初始化 70 格佈局`);
  }

  const today = new Date();

  await db.insert(tenants).values([
    { name: DEMO_TENANT_LINK_NAME, phone: "9123 4567", email: "tong@example.com", note: "手作飾物" },
    { name: "【示範】Leung K.", phone: "9876 5432", email: "leungk@example.com", note: "二手 figure" },
    { name: "【示範】阿 May", phone: "9555 1111", email: "may@example.com", note: "韓國文具" },
    { name: "【示範】Kelvin", phone: "9666 8888", email: "kelvin@example.com", note: "二手波鞋" },
  ]);
  const demoTenants = await db.select().from(tenants).where(like(tenants.name, `${DEMO_PREFIX}%`));
  const [t1, t2, t3, t4] = demoTenants;

  const rentOf = (code: string) => gridRentOf(code).toFixed(2);
  await db.insert(leases).values([
    { gridId: byCode["017"].id, tenantId: t1.id, startDate: fmt(addMonths(today, -2)), endDate: fmt(addMonths(today, 4)), rentFreeDays: 7, monthlyRent: rentOf("017"), deposit: rentOf("017"), status: "active", note: "首月免租 7 日" },
    { gridId: byCode["002"].id, tenantId: t2.id, startDate: fmt(addDays(addMonths(today, -1), -10)), endDate: fmt(addMonths(today, 5)), rentFreeDays: 7, monthlyRent: rentOf("002"), deposit: rentOf("002"), status: "active" },
    { gridId: byCode["026"].id, tenantId: t3.id, startDate: fmt(addMonths(today, -3)), endDate: fmt(addMonths(today, 9)), rentFreeDays: 14, monthlyRent: rentOf("026"), deposit: rentOf("026"), status: "active" },
    { gridId: byCode["036"].id, tenantId: t4.id, startDate: fmt(addDays(today, -25)), endDate: fmt(addMonths(today, 2)), rentFreeDays: 0, monthlyRent: rentOf("036"), deposit: rentOf("036"), status: "active", note: "季租" },
  ]);
  await db.update(grids).set({ status: "occupied" }).where(sql`${grids.code} in ('017','002','026','036')`);
  await db.update(grids).set({ status: "reserved" }).where(sql`${grids.code} in ('010','013')`);

  const demoLeases = await db
    .select()
    .from(leases)
    .where(inArray(leases.tenantId, [t1.id, t2.id, t3.id, t4.id]));

  // 銷售記錄：近 40 日（LCG 固定種子，結果可重現）
  const products: Record<string, [string, number][]> = {
    "017": [["手繪耳環", 88], ["黏土戒指", 68], ["布藝髮圈", 45], ["串珠手鏈", 78]],
    "002": [["中古龍珠 figure", 220], ["鬼滅襟章", 35], ["海賊王卡", 25], ["迷你模型", 150]],
    "026": [["韓國貼紙套裝", 32], ["原子筆 3 支裝", 28], ["A6 記事簿", 48], ["和紙膠帶", 22]],
    "036": [["二手波鞋", 650], ["鞋帶", 40], ["波鞋清潔劑", 78], ["鞋墊", 68]],
  };
  const saleRows: (typeof sales.$inferInsert)[] = [];
  let s = 42;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (const [code, tenant] of [["017", t1], ["002", t2], ["026", t3], ["036", t4]] as const) {
    for (let day = 39; day >= 0; day--) {
      const d = addDays(today, -day);
      if (rand() < 0.45) continue; // 唔係日日有單
      const entries = products[code];
      const [name, price] = entries[Math.floor(rand() * entries.length)];
      const qty = 1 + Math.floor(rand() * 3);
      saleRows.push({
        gridId: byCode[code].id,
        tenantId: tenant.id,
        saleDate: fmt(d),
        productName: name,
        quantity: qty,
        unitPrice: price.toFixed(2),
        totalAmount: (qty * price).toFixed(2),
      });
    }
  }
  if (saleRows.length) await db.insert(sales).values(saleRows);

  // 租金記錄：上月租金（已收）、本月租金（部分已收）、簽約按金（已收，一個月）
  const month = fmt(today).slice(0, 7);
  const lastMonth = fmt(addMonths(today, -1)).slice(0, 7);
  const rentRows: (typeof rentRecords.$inferInsert)[] = [];
  for (let i = 0; i < demoLeases.length; i++) {
    const l = demoLeases[i];
    rentRows.push({ leaseId: l.id, gridId: l.gridId, tenantId: l.tenantId, month: lastMonth, type: "rent", amount: l.monthlyRent, status: "paid", paidAt: `${lastMonth}-05` });
    const paid = i < 2;
    rentRows.push({ leaseId: l.id, gridId: l.gridId, tenantId: l.tenantId, month, type: "rent", amount: l.monthlyRent, status: paid ? "paid" : "unpaid", paidAt: paid ? `${month}-03` : null });
    rentRows.push({ leaseId: l.id, gridId: l.gridId, tenantId: l.tenantId, month: l.startDate.slice(0, 7), type: "deposit", amount: l.deposit, status: "paid", paidAt: l.startDate, note: "簽約按金（一個月）" });
  }
  await db.insert(rentRecords).values(rentRows);

  return { tenants: demoTenants.length, leases: demoLeases.length, sales: saleRows.length, rent: rentRows.length };
}

/** 清除示範營業資料（只郁【示範】租戶同佢哋嘅租約/銷售/租金記錄），格仔回復招租 */
export async function clearDemoBusiness(db: Db): Promise<number> {
  const demoTenants = await db.select().from(tenants).where(like(tenants.name, `${DEMO_PREFIX}%`));
  if (!demoTenants.length) return 0;
  const ids = demoTenants.map((t) => t.id);

  const affectedLeases = await db.select().from(leases).where(inArray(leases.tenantId, ids));
  const gridIds = affectedLeases.map((l) => l.gridId);

  await db.delete(sales).where(inArray(sales.tenantId, ids));
  await db.delete(rentRecords).where(inArray(rentRecords.tenantId, ids));
  await db.delete(leases).where(inArray(leases.tenantId, ids));
  await db.delete(tenants).where(inArray(tenants.id, ids));
  if (gridIds.length) {
    await db.update(grids).set({ status: "vacant" }).where(inArray(grids.id, gridIds));
  }
  return demoTenants.length;
}

/** 確保 demo 戶口存在（idempotent），並將 demo-tenant 連結到示範租戶檔案 */
export async function ensureDemoAccounts(db: Db): Promise<void> {
  for (const acc of [DEMO_OWNER, DEMO_TENANT] as const) {
    const unionId = `local:${acc.username}`;
    const rows = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
    if (!rows.length) {
      await db.insert(users).values({
        unionId,
        name: acc.name,
        passwordHash: await hashPassword(acc.password),
        role: acc.username === DEMO_OWNER.username ? "admin" : "user",
        lastSignInAt: new Date(),
      });
    }
  }
  // demo-tenant → 租戶檔案連結
  const [demoUser] = await db.select().from(users).where(eq(users.unionId, `local:${DEMO_TENANT.username}`)).limit(1);
  if (demoUser) {
    const [profile] = await db.select().from(tenants).where(eq(tenants.name, DEMO_TENANT_LINK_NAME)).limit(1);
    if (profile && profile.userId !== demoUser.id) {
      await db.update(tenants).set({ userId: demoUser.id }).where(eq(tenants.id, profile.id));
    }
  }
}

/** 真正嘅店主戶口（唔計 demo-owner） */
export async function findRealOwner(db: Db) {
  const rows = await db
    .select({ id: users.id, unionId: users.unionId })
    .from(users)
    .where(and(eq(users.role, "admin"), notLike(users.unionId, "local:demo-%")))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 建立或提升店主戶口（開機時用 OWNER_USERNAME / OWNER_PASSWORD；或者 npm run owner:create）。
 * - force=false（開機）：已經有店主就乜都唔做，避免每次開機覆蓋密碼
 * - force=true（CLI）：無論有冇店主，都將呢個用戶名設為店主並重設密碼
 */
export async function upsertOwner(
  db: Db,
  acc: { username: string; password: string; name: string },
  force = false,
): Promise<"created" | "promoted" | "skipped"> {
  if (!force && (await findRealOwner(db))) return "skipped";
  const unionId = `local:${acc.username.toLowerCase()}`;
  if (unionId.startsWith("local:demo-")) throw new Error("店主用戶名唔可以用 demo- 開頭");
  const passwordHash = await hashPassword(acc.password);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.unionId, unionId)).limit(1);
  if (existing) {
    await db.update(users).set({ role: "admin", passwordHash, name: acc.name }).where(eq(users.id, existing.id));
    return "promoted";
  }
  await db.insert(users).values({ unionId, name: acc.name, passwordHash, role: "admin" });
  return "created";
}

export async function ensureOwnerFromEnv(db: Db): Promise<void> {
  if (!env.ownerUsername || !env.ownerPassword) {
    if (!(await findRealOwner(db))) {
      console.warn("[owner] 未有店主戶口：請設定 OWNER_USERNAME / OWNER_PASSWORD 或執行 npm run owner:create");
    }
    return;
  }
  if (env.ownerPassword.length < 8) {
    console.error("[owner] OWNER_PASSWORD 最少 8 個字符，已略過建立店主");
    return;
  }
  const result = await upsertOwner(db, { username: env.ownerUsername, password: env.ownerPassword, name: env.ownerName });
  if (result !== "skipped") console.log(`[owner] 店主戶口 ${env.ownerUsername}：${result}`);
}

/**
 * 初始化：70 格一定會補齊；示範租戶 / 銷售 / demo 戶口只喺 DEMO_MODE=true 先生成。
 */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  const added = await ensureGridLayout(db);
  let biz = { tenants: 0, leases: 0, sales: 0, rent: 0 };
  if (env.demoMode) {
    const [tenantCount] = await db.select({ count: sql<number>`count(*)` }).from(tenants);
    if (Number(tenantCount?.count ?? 0) === 0) biz = await seedDemoBusiness(db);
    await ensureDemoAccounts(db);
  } else {
    const removed = await removeDemoAccounts(db);
    if (removed) console.log(`[seed] 示範模式已關閉，刪除 ${removed} 個 demo 戶口`);
  }
  if (added || biz.tenants) {
    console.log(`[seed] grids+${added} tenants=${biz.tenants} leases=${biz.leases} sales=${biz.sales} rent=${biz.rent}`);
  }
  return true;
}

/** 關閉示範模式時：刪除 demo 戶口（示範營業資料要喺後台手動清，避免誤刪） */
export async function removeDemoAccounts(db: Db): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(like(users.unionId, "local:demo-%"));
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  await db.update(tenants).set({ userId: null }).where(inArray(tenants.userId, ids));
  await db.update(sales).set({ createdBy: null }).where(inArray(sales.createdBy, ids));
  await db.delete(users).where(inArray(users.id, ids));
  return ids.length;
}

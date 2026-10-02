import { getDb } from "./connection";
import { grids, leases, rentRecords, sales, tenants, users } from "@db/schema";
import { and, desc, eq, gte, like, lte, ne, sql } from "drizzle-orm";

// ─── 公用 ────────────────────────────────────────────────────

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── 格仔 ────────────────────────────────────────────────────

export async function listGrids() {
  return getDb().select().from(grids).orderBy(grids.code);
}

export async function findGridByCode(code: string) {
  const rows = await getDb().select().from(grids).where(eq(grids.code, code)).limit(1);
  return rows[0] ?? null;
}

export async function findGridById(id: number) {
  const rows = await getDb().select().from(grids).where(eq(grids.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findTenantById(id: number) {
  const rows = await getDb().select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGrid(data: { code: string; size: "M" | "L"; monthlyRent: string }) {
  const [{ id }] = await getDb().insert(grids).values(data).returning({ id: grids.id });
  return id;
}

export async function updateGrid(
  id: number,
  data: Partial<{ code: string; size: "M" | "L"; monthlyRent: string; status: "vacant" | "occupied" | "reserved" }>,
) {
  await getDb().update(grids).set(data).where(eq(grids.id, id));
}

export async function deleteGrid(id: number) {
  await getDb().delete(grids).where(eq(grids.id, id));
}

export async function setGridStatus(id: number, status: "vacant" | "occupied" | "reserved") {
  await getDb().update(grids).set({ status }).where(eq(grids.id, id));
}

// ─── 租戶 ────────────────────────────────────────────────────

export async function listTenants() {
  return getDb()
    .select({
      id: tenants.id,
      userId: tenants.userId,
      name: tenants.name,
      phone: tenants.phone,
      email: tenants.email,
      note: tenants.note,
      createdAt: tenants.createdAt,
      accountName: users.name,
      accountEmail: users.email,
    })
    .from(tenants)
    .leftJoin(users, eq(tenants.userId, users.id))
    .orderBy(desc(tenants.createdAt));
}

export async function createTenant(data: { name: string; phone?: string; email?: string; note?: string }) {
  const [{ id }] = await getDb().insert(tenants).values(data).returning({ id: tenants.id });
  return id;
}

export async function updateTenant(
  id: number,
  data: Partial<{ name: string; phone: string; email: string; note: string; userId: number | null }>,
) {
  await getDb().update(tenants).set(data).where(eq(tenants.id, id));
}

export async function deleteTenant(id: number) {
  await getDb().delete(tenants).where(eq(tenants.id, id));
}

export async function findTenantByUserId(userId: number) {
  const rows = await getDb().select().from(tenants).where(eq(tenants.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function listUsers() {
  return getDb()
    .select({
      id: users.id,
      unionId: users.unionId,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

// ─── 租約 ────────────────────────────────────────────────────

export async function listLeases() {
  return getDb()
    .select({
      id: leases.id,
      gridId: leases.gridId,
      tenantId: leases.tenantId,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentFreeDays: leases.rentFreeDays,
      monthlyRent: leases.monthlyRent,
      deposit: leases.deposit,
      status: leases.status,
      note: leases.note,
      createdAt: leases.createdAt,
      gridCode: grids.code,
      tenantName: tenants.name,
    })
    .from(leases)
    .leftJoin(grids, eq(leases.gridId, grids.id))
    .leftJoin(tenants, eq(leases.tenantId, tenants.id))
    .orderBy(desc(leases.createdAt));
}

export async function findActiveLeaseByGrid(gridId: number) {
  const rows = await getDb()
    .select()
    .from(leases)
    .where(and(eq(leases.gridId, gridId), eq(leases.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function findActiveLeasesByTenant(tenantId: number) {
  return getDb()
    .select({
      id: leases.id,
      gridId: leases.gridId,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentFreeDays: leases.rentFreeDays,
      monthlyRent: leases.monthlyRent,
      gridCode: grids.code,
    })
    .from(leases)
    .leftJoin(grids, eq(leases.gridId, grids.id))
    .where(and(eq(leases.tenantId, tenantId), eq(leases.status, "active")));
}

export async function createLease(data: {
  gridId: number;
  tenantId: number;
  startDate: string;
  endDate: string;
  rentFreeDays: number;
  monthlyRent: string;
  deposit: string;
  note?: string;
}) {
  const [{ id }] = await getDb().insert(leases).values(data).returning({ id: leases.id });
  return id;
}

export async function updateLease(
  id: number,
  data: Partial<{
    startDate: string;
    endDate: string;
    rentFreeDays: number;
    monthlyRent: string;
    deposit: string;
    status: "active" | "ended";
    note: string;
  }>,
) {
  await getDb().update(leases).set(data).where(eq(leases.id, id));
}

// ─── 銷售 ────────────────────────────────────────────────────

export type SaleFilters = {
  from?: string;
  to?: string;
  gridId?: number;
  tenantId?: number;
  createdBy?: number;
};

export async function listSales(filters: SaleFilters = {}, limit = 500) {
  const conds = [];
  if (filters.from) conds.push(gte(sales.saleDate, filters.from));
  if (filters.to) conds.push(lte(sales.saleDate, filters.to));
  if (filters.gridId) conds.push(eq(sales.gridId, filters.gridId));
  if (filters.tenantId) conds.push(eq(sales.tenantId, filters.tenantId));
  if (filters.createdBy) conds.push(eq(sales.createdBy, filters.createdBy));

  return getDb()
    .select({
      id: sales.id,
      gridId: sales.gridId,
      tenantId: sales.tenantId,
      saleDate: sales.saleDate,
      saleTime: sales.saleTime,
      productName: sales.productName,
      quantity: sales.quantity,
      unitPrice: sales.unitPrice,
      totalAmount: sales.totalAmount,
      note: sales.note,
      createdBy: sales.createdBy,
      createdAt: sales.createdAt,
      gridCode: grids.code,
      tenantName: tenants.name,
    })
    .from(sales)
    .leftJoin(grids, eq(sales.gridId, grids.id))
    .leftJoin(tenants, eq(sales.tenantId, tenants.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .limit(limit);
}

export async function createSale(data: {
  gridId: number | null;
  tenantId: number | null;
  saleDate: string;
  saleTime?: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  note?: string;
  createdBy?: number;
}) {
  const [{ id }] = await getDb().insert(sales).values(data).returning({ id: sales.id });
  return id;
}

/** 批量新增銷售（POS 匯入用，每 200 行一批） */
export async function createSalesBatch(
  rows: {
    gridId: number | null;
    tenantId: number | null;
    saleDate: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
    note: string;
    createdBy: number;
  }[],
) {
  for (let i = 0; i < rows.length; i += 200) {
    await getDb().insert(sales).values(rows.slice(i, i + 200));
  }
}

export async function countSalesWithNotePrefix(prefix: string) {
  const [row] = await getDb()
    .select({ c: sql<number>`count(*)` })
    .from(sales)
    .where(like(sales.note, `${prefix.replace(/[%_\\]/g, "\\$&")}%`));
  return Number(row?.c ?? 0);
}

export async function updateSale(
  id: number,
  data: Partial<{
    saleDate: string;
    saleTime: string | null;
    productName: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
    note: string;
  }>,
) {
  await getDb().update(sales).set(data).where(eq(sales.id, id));
}

export async function findSaleById(id: number) {
  const rows = await getDb().select().from(sales).where(eq(sales.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteSale(id: number) {
  await getDb().delete(sales).where(eq(sales.id, id));
}

// ─── 租金／按金 ───────────────────────────────────────────────

export async function listRentRecords(filters: { month?: string; status?: "unpaid" | "paid" } = {}) {
  const conds = [];
  if (filters.month) conds.push(eq(rentRecords.month, filters.month));
  if (filters.status) conds.push(eq(rentRecords.status, filters.status));

  return getDb()
    .select({
      id: rentRecords.id,
      leaseId: rentRecords.leaseId,
      gridId: rentRecords.gridId,
      tenantId: rentRecords.tenantId,
      month: rentRecords.month,
      type: rentRecords.type,
      amount: rentRecords.amount,
      status: rentRecords.status,
      paidAt: rentRecords.paidAt,
      note: rentRecords.note,
      createdAt: rentRecords.createdAt,
      gridCode: grids.code,
      tenantName: tenants.name,
    })
    .from(rentRecords)
    .leftJoin(grids, eq(rentRecords.gridId, grids.id))
    .leftJoin(tenants, eq(rentRecords.tenantId, tenants.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(rentRecords.month), desc(rentRecords.id))
    .limit(500);
}

export async function createRentRecord(data: {
  leaseId: number;
  gridId: number;
  tenantId: number;
  month: string;
  type: "rent" | "deposit";
  amount: string;
  note?: string;
}) {
  const [{ id }] = await getDb().insert(rentRecords).values(data).returning({ id: rentRecords.id });
  return id;
}

export async function findRentRecord(leaseId: number, month: string, type: "rent" | "deposit") {
  const rows = await getDb()
    .select()
    .from(rentRecords)
    .where(and(eq(rentRecords.leaseId, leaseId), eq(rentRecords.month, month), eq(rentRecords.type, type)))
    .limit(1);
  return rows[0] ?? null;
}

export async function markRentPaid(id: number, paidAt: string) {
  await getDb().update(rentRecords).set({ status: "paid", paidAt }).where(eq(rentRecords.id, id));
}

export async function markRentUnpaid(id: number) {
  await getDb().update(rentRecords).set({ status: "unpaid", paidAt: null }).where(eq(rentRecords.id, id));
}

export async function deleteRentRecord(id: number) {
  await getDb().delete(rentRecords).where(eq(rentRecords.id, id));
}

// ─── 統計 ────────────────────────────────────────────────────

export async function adminStats() {
  const db = getDb();
  const month = currentMonth();

  const [gridAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      occupied: sql<number>`sum(case when ${grids.status} = 'occupied' then 1 else 0 end)`,
      reserved: sql<number>`sum(case when ${grids.status} = 'reserved' then 1 else 0 end)`,
    })
    .from(grids);

  const [salesAgg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      qty: sql<number>`coalesce(sum(${sales.quantity}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .where(like(sales.saleDate, `${month}%`));

  const [leaseAgg] = await db
    .select({ active: sql<number>`count(*)` })
    .from(leases)
    .where(eq(leases.status, "active"));

  const in30 = new Date(Date.now() + 30 * 86400000);
  const in30Str = `${in30.getFullYear()}-${String(in30.getMonth() + 1).padStart(2, "0")}-${String(in30.getDate()).padStart(2, "0")}`;
  const today = new Date().toISOString().slice(0, 10);

  const [expiringAgg] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leases)
    .where(and(eq(leases.status, "active"), gte(leases.endDate, today), lte(leases.endDate, in30Str)));

  const [rentAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      amount: sql<string>`coalesce(sum(${rentRecords.amount}), 0)`,
    })
    .from(rentRecords)
    .where(eq(rentRecords.status, "unpaid"));

  const [tenantAgg] = await db.select({ count: sql<number>`count(*)` }).from(tenants);

  return {
    month,
    grids: {
      total: Number(gridAgg?.total ?? 0),
      occupied: Number(gridAgg?.occupied ?? 0),
      reserved: Number(gridAgg?.reserved ?? 0),
      vacant: Number(gridAgg?.total ?? 0) - Number(gridAgg?.occupied ?? 0) - Number(gridAgg?.reserved ?? 0),
    },
    sales: {
      amount: String(salesAgg?.amount ?? "0"),
      qty: Number(salesAgg?.qty ?? 0),
      count: Number(salesAgg?.count ?? 0),
    },
    leases: { active: Number(leaseAgg?.active ?? 0), expiring30: Number(expiringAgg?.count ?? 0) },
    rent: { unpaidCount: Number(rentAgg?.count ?? 0), unpaidAmount: String(rentAgg?.amount ?? "0") },
    tenants: { total: Number(tenantAgg?.count ?? 0) },
  };
}

export async function tenantStats(tenantId: number) {
  const db = getDb();
  const month = currentMonth();

  const [monthAgg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      qty: sql<number>`coalesce(sum(${sales.quantity}), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, tenantId), like(sales.saleDate, `${month}%`)));

  const [totalAgg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      qty: sql<number>`coalesce(sum(${sales.quantity}), 0)`,
    })
    .from(sales)
    .where(eq(sales.tenantId, tenantId));

  const activeLeases = await findActiveLeasesByTenant(tenantId);

  return {
    month,
    monthAmount: String(monthAgg?.amount ?? "0"),
    monthQty: Number(monthAgg?.qty ?? 0),
    totalAmount: String(totalAgg?.amount ?? "0"),
    totalQty: Number(totalAgg?.qty ?? 0),
    activeLeases,
  };
}

export async function publicStats() {
  const db = getDb();
  const [gridAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      occupied: sql<number>`sum(case when ${grids.status} = 'occupied' then 1 else 0 end)`,
    })
    .from(grids);

  const sizeRows = await db
    .select({
      size: grids.size,
      minRent: sql<string>`min(${grids.monthlyRent})`,
    })
    .from(grids)
    .groupBy(grids.size);

  const [tenantAgg] = await db.select({ count: sql<number>`count(*)` }).from(tenants);

  const total = Number(gridAgg?.total ?? 0);
  const occupied = Number(gridAgg?.occupied ?? 0);

  return {
    grids: { total, occupied, vacant: total - occupied },
    occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    tenants: Number(tenantAgg?.count ?? 0),
    sizeRent: sizeRows.map((r) => ({ size: r.size, minRent: String(r.minRent) })),
  };
}

// 租戶專用：租戶嘅銷售記錄
export async function listSalesByTenant(tenantId: number, month?: string) {
  const conds = [eq(sales.tenantId, tenantId)];
  if (month) conds.push(like(sales.saleDate, `${month}%`));

  return getDb()
    .select({
      id: sales.id,
      saleDate: sales.saleDate,
      saleTime: sales.saleTime,
      productName: sales.productName,
      quantity: sales.quantity,
      unitPrice: sales.unitPrice,
      totalAmount: sales.totalAmount,
      note: sales.note,
      gridCode: grids.code,
    })
    .from(sales)
    .leftJoin(grids, eq(sales.gridId, grids.id))
    .where(and(...conds))
    .orderBy(desc(sales.saleDate), desc(sales.id))
    .limit(500);
}

// 避免 unused import 警告
export { ne };

// ─── 週結報表 ────────────────────────────────────────────────

/** 星期一起計嘅一週銷售報表（店員＋店主可查） */
export async function weeklyReport(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const weekEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  const rows = await getDb()
    .select({
      id: sales.id,
      gridId: sales.gridId,
      tenantId: sales.tenantId,
      saleDate: sales.saleDate,
      quantity: sales.quantity,
      totalAmount: sales.totalAmount,
      gridCode: grids.code,
      tenantName: tenants.name,
    })
    .from(sales)
    .leftJoin(grids, eq(sales.gridId, grids.id))
    .leftJoin(tenants, eq(sales.tenantId, tenants.id))
    .where(and(gte(sales.saleDate, weekStart), lte(sales.saleDate, weekEnd)))
    .orderBy(sales.saleDate);

  const byGridMap = new Map<string, { gridCode: string; tenantName: string | null; qty: number; amount: number; count: number }>();
  const byDayMap = new Map<string, { date: string; qty: number; amount: number; count: number }>();
  let directQty = 0, directAmount = 0, directCount = 0;
  let totalQty = 0, totalAmount = 0;

  for (const r of rows) {
    const amt = Number(r.totalAmount) || 0;
    totalQty += r.quantity;
    totalAmount += amt;

    const day = byDayMap.get(r.saleDate) ?? { date: r.saleDate, qty: 0, amount: 0, count: 0 };
    day.qty += r.quantity;
    day.amount += amt;
    day.count += 1;
    byDayMap.set(r.saleDate, day);

    if (r.gridId == null) {
      directQty += r.quantity;
      directAmount += amt;
      directCount += 1;
      continue;
    }
    const key = r.gridCode ?? String(r.gridId);
    const g = byGridMap.get(key) ?? { gridCode: key, tenantName: r.tenantName, qty: 0, amount: 0, count: 0 };
    g.qty += r.quantity;
    g.amount += amt;
    g.count += 1;
    byGridMap.set(key, g);
  }

  return {
    weekStart,
    weekEnd,
    byGrid: [...byGridMap.values()].sort((a, b) => a.gridCode.localeCompare(b.gridCode)),
    byDay: [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    direct: { qty: directQty, amount: directAmount.toFixed(2), count: directCount },
    grand: { qty: totalQty, amount: totalAmount.toFixed(2), count: rows.length },
  };
}

// ─── 租戶銷售情況 ───────────────────────────────────────────

type ReportRow = {
  gridId: number | null;
  tenantId: number | null;
  saleDate: string;
  productName: string;
  quantity: number;
  totalAmount: string;
};

async function salesInRange(from: string, to: string): Promise<ReportRow[]> {
  return getDb()
    .select({
      gridId: sales.gridId,
      tenantId: sales.tenantId,
      saleDate: sales.saleDate,
      productName: sales.productName,
      quantity: sales.quantity,
      totalAmount: sales.totalAmount,
    })
    .from(sales)
    .where(and(gte(sales.saleDate, from), lte(sales.saleDate, to)));
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1–12
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * 比較期間：
 * - 整月（1 號至月尾，可以跨幾個月）→ 對上同樣數目嘅整月
 * - 1 月 1 日開始（今年至今）→ 去年同期
 * - 其他 → 緊接之前同樣日數
 */
function comparePeriod(from: string, to: string, days: number) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fd === 1 && td === lastDayOfMonth(ty, tm)) {
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    const start = new Date(Date.UTC(fy, fm - 1 - months, 1));
    const endMonth = new Date(Date.UTC(fy, fm - 1, 0));
    return {
      prevFrom: start.toISOString().slice(0, 10),
      prevTo: endMonth.toISOString().slice(0, 10),
    };
  }
  if (fm === 1 && fd === 1 && fy === ty) {
    return { prevFrom: ymd(fy - 1, 1, 1), prevTo: ymd(ty - 1, tm, Math.min(td, lastDayOfMonth(ty - 1, tm))) };
  }
  return { prevFrom: shiftDate(from, -days), prevTo: shiftDate(from, -1) };
}

function shiftDate(d: string, days: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

/**
 * 每個租戶（或者未有租約嘅格仔）喺期間內嘅銷售：筆數、數量、金額、佔比、
 * 同上一段同樣長度期間比較、熱賣貨品、每日走勢、現時租約月租。
 * 店舖直銷（gridId 為 null）另外一行。
 */
export async function tenantSalesReport(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const { prevFrom, prevTo } = comparePeriod(from, to, days);
  const [rows, prevRows, allGrids, allTenants, activeLeases] = await Promise.all([
    salesInRange(from, to),
    salesInRange(prevFrom, prevTo),
    listGrids(),
    getDb().select({ id: tenants.id, name: tenants.name }).from(tenants),
    getDb()
      .select({ gridId: leases.gridId, tenantId: leases.tenantId, monthlyRent: leases.monthlyRent })
      .from(leases)
      .where(eq(leases.status, "active")),
  ]);
  const gridCode = new Map(allGrids.map((g) => [g.id, g.code]));
  const tenantName = new Map(allTenants.map((t) => [t.id, t.name]));

  // 分組鍵：有租戶 → t:租戶；有格仔冇租戶 → g:格仔；都冇 → direct（店舖直銷）
  const keyOf = (r: { tenantId: number | null; gridId: number | null }) =>
    r.tenantId != null ? `t:${r.tenantId}` : r.gridId != null ? `g:${r.gridId}` : "direct";

  type Group = {
    key: string;
    kind: "tenant" | "grid" | "direct";
    name: string;
    gridIds: Set<number>;
    count: number;
    qty: number;
    amount: number;
    prevAmount: number;
    products: Map<string, { qty: number; amount: number }>;
    daily: Map<string, number>;
    lastSaleDate: string | null;
  };
  const groups = new Map<string, Group>();
  const ensure = (r: { tenantId: number | null; gridId: number | null }) => {
    const key = keyOf(r);
    let g = groups.get(key);
    if (!g) {
      const kind = key === "direct" ? "direct" : key.startsWith("t:") ? "tenant" : "grid";
      g = {
        key,
        kind,
        name:
          kind === "direct"
            ? "店舖直銷"
            : kind === "tenant"
              ? tenantName.get(r.tenantId!) ?? `租戶 #${r.tenantId}`
              : `格仔 ${gridCode.get(r.gridId!) ?? r.gridId}（未有租約）`,
        gridIds: new Set(),
        count: 0,
        qty: 0,
        amount: 0,
        prevAmount: 0,
        products: new Map(),
        daily: new Map(),
        lastSaleDate: null,
      };
      groups.set(key, g);
    }
    return g;
  };

  for (const r of rows) {
    const g = ensure(r);
    const amt = Number(r.totalAmount) || 0;
    if (r.gridId != null) g.gridIds.add(r.gridId);
    g.count += 1;
    g.qty += r.quantity;
    g.amount += amt;
    const p = g.products.get(r.productName) ?? { qty: 0, amount: 0 };
    p.qty += r.quantity;
    p.amount += amt;
    g.products.set(r.productName, p);
    g.daily.set(r.saleDate, (g.daily.get(r.saleDate) ?? 0) + amt);
    if (!g.lastSaleDate || r.saleDate > g.lastSaleDate) g.lastSaleDate = r.saleDate;
  }
  for (const r of prevRows) {
    const g = ensure(r);
    g.prevAmount += Number(r.totalAmount) || 0;
    if (r.gridId != null) g.gridIds.add(r.gridId);
  }

  // 有生效租約但期間冇銷售嘅租戶都要列出（睇到邊個賣唔到嘢）
  for (const l of activeLeases) {
    const g = ensure({ tenantId: l.tenantId, gridId: l.gridId });
    g.gridIds.add(l.gridId);
  }
  const rentByTenant = new Map<number, number>();
  for (const l of activeLeases) rentByTenant.set(l.tenantId, (rentByTenant.get(l.tenantId) ?? 0) + Number(l.monthlyRent));

  const total = [...groups.values()].reduce((a, g) => a + g.amount, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const list = [...groups.values()]
    .map((g) => ({
      key: g.key,
      kind: g.kind,
      name: g.name,
      grids: [...g.gridIds].map((id) => gridCode.get(id) ?? String(id)).sort(),
      count: g.count,
      qty: g.qty,
      amount: r2(g.amount),
      prevAmount: r2(g.prevAmount),
      share: total > 0 ? r2((g.amount / total) * 100) : 0,
      monthlyRent: g.kind === "tenant" ? rentByTenant.get(Number(g.key.slice(2))) ?? null : null,
      lastSaleDate: g.lastSaleDate,
      topProducts: [...g.products.entries()]
        .map(([name, p]) => ({ name, qty: p.qty, amount: r2(p.amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8),
      daily: [...g.daily.entries()].map(([date, amount]) => ({ date, amount: r2(amount) })).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    // 有銷售或者有租約先列；店舖直銷放最尾
    .filter((g) => g.count > 0 || g.prevAmount > 0 || g.kind === "tenant")
    .sort((a, b) => (a.kind === "direct" ? 1 : b.kind === "direct" ? -1 : b.amount - a.amount));

  const direct = list.find((g) => g.kind === "direct");
  return {
    from,
    to,
    days,
    prev: { from: prevFrom, to: prevTo, amount: r2(prevRows.reduce((a, r) => a + (Number(r.totalAmount) || 0), 0)) },
    totals: {
      amount: r2(total),
      count: rows.length,
      gridAmount: r2(total - (direct?.amount ?? 0)),
      directAmount: direct?.amount ?? 0,
      sellers: list.filter((g) => g.kind !== "direct" && g.count > 0).length,
      unassignedGrids: list.filter((g) => g.kind === "grid" && g.count > 0).length,
    },
    groups: list,
  };
}

/** 租戶專區：總銷售 + 按貨品合計（唔包備註／條碼等內部資料） */
export async function tenantItemSummary(tenantId: number, month?: string, gridId?: number) {
  const conds = [eq(sales.tenantId, tenantId)];
  if (month) conds.push(like(sales.saleDate, `${month}%`));
  if (gridId) conds.push(eq(sales.gridId, gridId));
  const items = await getDb()
    .select({
      name: sales.productName,
      qty: sql<number>`sum(${sales.quantity})::int`,
      amount: sql<string>`sum(${sales.totalAmount})`,
    })
    .from(sales)
    .where(and(...conds))
    .groupBy(sales.productName)
    .orderBy(sql`sum(${sales.totalAmount}) desc`);
  const list = items.map((i) => ({ name: i.name, qty: Number(i.qty), amount: Number(i.amount) }));
  return {
    month: month ?? null,
    totalAmount: Math.round(list.reduce((a, i) => a + i.amount, 0) * 100) / 100,
    totalQty: list.reduce((a, i) => a + i.qty, 0),
    items: list,
  };
}

/** 租戶有銷售嘅格仔（編號細至大），畀格仔選單用 */
export async function tenantSaleGrids(tenantId: number) {
  const rows = await getDb()
    .selectDistinct({ code: grids.code })
    .from(sales)
    .innerJoin(grids, eq(sales.gridId, grids.id))
    .where(eq(sales.tenantId, tenantId));
  return rows.map((r) => r.code);
}

/** 租戶有銷售嘅月份（新至舊），畀月份選單用 */
export async function tenantSaleMonths(tenantId: number) {
  const rows = await getDb()
    .selectDistinct({ m: sql<string>`substr(${sales.saleDate}, 1, 7)` })
    .from(sales)
    .where(eq(sales.tenantId, tenantId));
  return rows.map((r) => r.m).sort().reverse();
}

/**
 * 自動配對：有格仔但未有租戶嘅銷售，按「銷售日期落喺邊份租約期間」計入該租約租戶。
 * 租約（生效中或已完結）都計。可以重複執行，只會郁 tenantId 為 null 嘅記錄。
 * 回傳配對咗幾多筆。
 */
export async function assignSalesToLeases(): Promise<number> {
  const res: unknown = await getDb().execute(sql`
    UPDATE gridbox.sales s SET "tenantId" = l."tenantId", "updatedAt" = now()
    FROM gridbox.leases l
    WHERE s."gridId" = l."gridId" AND s."tenantId" IS NULL
      AND s."saleDate" >= l."startDate" AND s."saleDate" <= l."endDate"`);
  return Number((res as { rowCount?: number; affectedRows?: number }).rowCount ?? (res as { affectedRows?: number }).affectedRows ?? 0);
}

/** 租約日期改咗：先將呢份租約之外日期嘅銷售撤回，再重新配對 */
export async function unassignSalesOutsideLease(leaseId: number) {
  await getDb().execute(sql`
    UPDATE gridbox.sales s SET "tenantId" = NULL, "updatedAt" = now()
    FROM gridbox.leases l
    WHERE l.id = ${leaseId} AND s."gridId" = l."gridId" AND s."tenantId" = l."tenantId"
      AND (s."saleDate" < l."startDate" OR s."saleDate" > l."endDate")`);
}

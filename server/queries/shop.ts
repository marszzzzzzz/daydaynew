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
};

export async function listSales(filters: SaleFilters = {}, limit = 500) {
  const conds = [];
  if (filters.from) conds.push(gte(sales.saleDate, filters.from));
  if (filters.to) conds.push(lte(sales.saleDate, filters.to));
  if (filters.gridId) conds.push(eq(sales.gridId, filters.gridId));
  if (filters.tenantId) conds.push(eq(sales.tenantId, filters.tenantId));

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

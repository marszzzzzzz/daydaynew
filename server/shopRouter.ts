import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql, eq, like } from "drizzle-orm";
import { createRouter, publicQuery, authedQuery, adminQuery, staffQuery } from "./middleware";
import { withDbRetry, dbStatus } from "./bootstrap";
import { getDb } from "./queries/connection";
import { users, tenants, grids } from "@db/schema";
import {
  ensureGridLayout,
  seedDemoBusiness,
  clearDemoBusiness,
  ensureDemoAccounts,
  DEMO_PREFIX,
  DEMO_OWNER,
  DEMO_TENANT,
} from "../db/seed-lib";
import * as q from "./queries/shop";
import { env } from "./lib/env";

function assertDemoMode() {
  if (!env.demoMode) {
    throw new TRPCError({ code: "FORBIDDEN", message: "示範模式已關閉（DEMO_MODE=false），唔可以生成示範資料或 demo 戶口" });
  }
}
import { normalizeGridCode } from "@contracts/gridLayout";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式須為 YYYY-MM-DD");
const monthStr = z.string().regex(/^\d{4}-\d{2}$/, "月份格式須為 YYYY-MM");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時間格式須為 HH:MM（24 小時制）");

/** 店員只可以改／刪自己建立嘅銷售記錄；店主無限制 */
async function assertSaleEditable(saleId: number, user: { id: number; role: string }) {
  const sale = await q.findSaleById(saleId);
  if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢條銷售記錄" });
  if (user.role !== "admin" && sale.createdBy !== user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "店員只可以修改自己輸入嘅記錄" });
  }
}
const money = z
  .number()
  .nonnegative("金額不可為負數")
  .transform((n) => n.toFixed(2));

function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

/** CSV parser：支援引號欄位、CRLF、欄位內 tab */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/** 解析 POS「商品銷售_明細」CSV（按欄位名搵欄，唔靠固定位置） */
export function parsePosCsv(text: string):
  | { error: string }
  | {
      period: { start: string; end: string; defaultDate: string } | null;
      items: { row: number; name: string; qty: number; amount: string; unitPrice: string; category: string; gridCode: string | null; note: string }[];
      errors: { row: number; message: string }[];
      skippedRent: number;
    } {
  const rows = parseCsvText(text.replace(/^\uFEFF/, ""));
  const pm = text.slice(0, 400).match(/(\d{4}-\d{2}-\d{2})\s*[\d-]*\s*至\s*(\d{4}-\d{2}-\d{2})/);
  let period: { start: string; end: string; defaultDate: string } | null = null;
  if (pm) {
    // 結束時間係翌日朝早（例如 07-31 10:00），即係最後一個營業日係結束日前一日
    const d = new Date(pm[2] + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const last = d.toISOString().slice(0, 10);
    period = { start: pm[1], end: pm[2], defaultDate: last < pm[1] ? pm[1] : last };
  }
  const h = rows.findIndex((r) => r.some((c) => c.trim() === "商品名稱"));
  if (h < 0) return { error: "唔係 POS「商品銷售_明細」格式：搵唔到欄位標題（行號,商品編號,商品名稱,…）" };
  const head = rows[h].map((c) => c.trim());
  const col = (name: string) => head.indexOf(name);
  const c = {
    no: col("商品編號"),
    name: col("商品名稱"),
    spec: col("規格"),
    qty: col("數量"),
    amount: col("銷售金額"),
    cat: col("商品分類"),
    barcode: col("商品條碼"),
  };
  if (c.name < 0 || c.qty < 0 || c.amount < 0 || c.cat < 0) {
    return { error: "POS 檔缺少必要欄位（商品名稱、數量、銷售金額、商品分類）" };
  }
  const clean = (v: string | undefined) => (v ?? "").replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  const items = [];
  const errors: { row: number; message: string }[] = [];
  let skippedRent = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const first = clean(r[0]);
    if (!first || first.startsWith("合計")) continue;
    const row = i + 1;
    const name = clean(r[c.name]);
    const category = clean(r[c.cat]);
    const qty = Number(clean(r[c.qty]));
    const amount = Number(clean(r[c.amount]));
    if (/租金|按金/.test(category)) {
      skippedRent++;
      continue;
    }
    if (!name || name === "-") {
      errors.push({ row, message: "商品名稱空白" });
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errors.push({ row, message: `數量錯誤：${clean(r[c.qty])}` });
      continue;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push({ row, message: `銷售金額錯誤：${clean(r[c.amount])}` });
      continue;
    }
    const gm = category.match(/^(\d{1,3})\s*格$/);
    const gridCode = gm ? gm[1].padStart(3, "0") : null;
    const extras = [
      c.no >= 0 && clean(r[c.no]) ? `編號 ${clean(r[c.no])}` : "",
      c.spec >= 0 && clean(r[c.spec]) && clean(r[c.spec]) !== "-" ? `規格 ${clean(r[c.spec])}` : "",
      category && category !== "-" ? `分類 ${category}` : "",
      c.barcode >= 0 && clean(r[c.barcode]) && clean(r[c.barcode]) !== "-" ? `條碼 ${clean(r[c.barcode])}` : "",
    ].filter(Boolean);
    items.push({
      row,
      name: name.slice(0, 200),
      qty,
      amount: amount.toFixed(2),
      unitPrice: (amount / qty).toFixed(2),
      category,
      gridCode,
      note: extras.join(" · "),
    });
  }
  return { period, items, errors, skippedRent };
}

export const shopRouter = createRouter({
  /** 宣傳頁公開統計 */
  publicStats: publicQuery.query(() => withDbRetry(() => q.publicStats())),

  /** 宣傳頁格仔牆（只暴露編號、尺寸、狀態） */
  publicGridWall: publicQuery.query(() =>
    withDbRetry(async () => {
      const rows = await q.listGrids();
      return rows.map((g) => ({ code: g.code, size: g.size, status: g.status, monthlyRent: g.monthlyRent }));
    }),
  ),

  /** 資料庫健康檢查（公開，方便診斷） */
  dbHealth: publicQuery.query(() => dbStatus()),

  // ─── 租戶（任何已登入用戶；以連結嘅租戶檔案為準） ──────────

  myTenantProfile: authedQuery.query(async ({ ctx }) => {
    const tenant = await q.findTenantByUserId(ctx.user.id);
    return tenant ?? null;
  }),

  mySales: authedQuery
    .input(z.object({ month: monthStr.optional() }))
    .query(async ({ ctx, input }) => {
      const tenant = await q.findTenantByUserId(ctx.user.id);
      if (!tenant) return null;
      return q.listSalesByTenant(tenant.id, input.month);
    }),

  mySummary: authedQuery.query(async ({ ctx }) => {
    const tenant = await q.findTenantByUserId(ctx.user.id);
    if (!tenant) return null;
    const stats = await q.tenantStats(tenant.id);
    return { tenant, stats };
  }),

  // ─── 店主 Admin ──────────────────────────────────────────

  admin: createRouter({
    stats: adminQuery.query(() => q.adminStats()),

    // ─── 示範資料生成器 ─────────────────────────────────
    /** 狀態：格仔數、示範租戶數、demo 戶口是否存在 */
    demoStatus: adminQuery.query(() =>
      withDbRetry(async () => {
        const db = getDb();
        const [g] = await db.select({ count: sql<number>`count(*)` }).from(grids);
        const [t] = await db.select({ count: sql<number>`count(*)` }).from(tenants).where(like(tenants.name, `${DEMO_PREFIX}%`));
        const demoUsers = await db
          .select({ unionId: users.unionId })
          .from(users)
          .where(like(users.unionId, "local:demo-%"));
        return {
          grids: Number(g?.count ?? 0),
          demoTenants: Number(t?.count ?? 0),
          demoAccounts: demoUsers.map((u) => u.unionId.replace("local:", "")),
          expectedGrids: 70,
          demoMode: env.demoMode,
          demoCredentials: { owner: DEMO_OWNER.username, tenant: DEMO_TENANT.username, password: DEMO_OWNER.password },
        };
      }),
    ),

    /** 初始化 / 補齊 70 格佈局（7 層 × 10 直行，編號 001–070；第 3、4 層（全部 10 直行）係大格；已存在跳過） */
    initGrids: adminQuery.mutation(() =>
      withDbRetry(async () => {
        const added = await ensureGridLayout(getDb());
        return { ok: true, added };
      }),
    ),

    /** 生成示範營業資料（租戶＋租約＋40 日銷售＋租金按金）；已有示範租戶時拒絕 */
    generateDemoData: adminQuery.mutation(() =>
      withDbRetry(async () => {
        assertDemoMode();
        const db = getDb();
        const [t] = await db.select({ count: sql<number>`count(*)` }).from(tenants).where(like(tenants.name, `${DEMO_PREFIX}%`));
        if (Number(t?.count ?? 0) > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "已有示範資料，請先「清除示範資料」再生成" });
        }
        await ensureGridLayout(db);
        const result = await seedDemoBusiness(db);
        await ensureDemoAccounts(db);
        return { ok: true, ...result };
      }),
    ),

    /** 清除示範資料（只刪【示範】租戶及其租約/銷售/租金記錄，格仔回復招租） */
    clearDemoData: adminQuery.mutation(() =>
      withDbRetry(async () => {
        const removed = await clearDemoBusiness(getDb());
        return { ok: true, removed };
      }),
    ),

    /** 重置 demo 戶口密碼（demo-owner / demo-tenant → demo1234） */
    resetDemoAccounts: adminQuery.mutation(() =>
      withDbRetry(async () => {
        assertDemoMode();
        const db = getDb();
        await ensureDemoAccounts(db);
        const { hashPassword } = await import("./password");
        const hash = await hashPassword(DEMO_OWNER.password);
        for (const acc of [DEMO_OWNER, DEMO_TENANT]) {
          await db.update(users).set({ passwordHash: hash }).where(eq(users.unionId, `local:${acc.username}`));
        }
        return { ok: true };
      }),
    ),

    // 格仔
    listGrids: staffQuery.query(() => q.listGrids()),
    createGrid: adminQuery
      .input(
        z.object({
          code: z.string().min(1, "請輸入格仔編號").max(20),
          size: z.enum(["M", "L"]),
          monthlyRent: money,
        }),
      )
      .mutation(async ({ input }) => {
        // 數字編號統一補零：24 → 024（同 001–070 標準對齊）
        const code = /^\d{1,3}$/.test(input.code.trim()) ? normalizeGridCode(input.code) : input.code.trim().toUpperCase();
        const existing = await q.findGridByCode(code);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: `格仔編號 ${code} 已存在` });
        return q.createGrid({ code, size: input.size, monthlyRent: input.monthlyRent });
      }),
    updateGrid: adminQuery
      .input(
        z.object({
          id: z.number(),
          code: z.string().min(1).max(20).optional(),
          size: z.enum(["M", "L"]).optional(),
          monthlyRent: money.optional(),
          status: z.enum(["vacant", "occupied", "reserved"]).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.code) data.code = data.code.toUpperCase();
        await q.updateGrid(id, data);
        return { ok: true };
      }),
    deleteGrid: adminQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const lease = await q.findActiveLeaseByGrid(input.id);
        if (lease) throw new TRPCError({ code: "CONFLICT", message: "此格仔有生效中嘅租約，請先終止租約" });
        await q.deleteGrid(input.id);
        return { ok: true };
      }),

    // 租戶
    listTenants: adminQuery.query(() => q.listTenants()),
    listUsers: adminQuery.query(() => q.listUsers()),
    createTenant: adminQuery
      .input(
        z.object({
          name: z.string().min(1, "請輸入租戶名稱").max(100),
          phone: z.string().max(50).optional(),
          email: z.string().max(320).optional(),
          note: z.string().optional(),
        }),
      )
      .mutation(({ input }) => q.createTenant(input)),
    updateTenant: adminQuery
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(100).optional(),
          phone: z.string().max(50).optional(),
          email: z.string().max(320).optional(),
          note: z.string().optional(),
          userId: z.number().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await q.updateTenant(id, data);
        return { ok: true };
      }),
    deleteTenant: adminQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await q.deleteTenant(input.id);
        return { ok: true };
      }),

    // 租約
    listLeases: adminQuery.query(() => q.listLeases()),
    createLease: adminQuery
      .input(
        z.object({
          gridId: z.number(),
          tenantId: z.number(),
          startDate: dateStr,
          endDate: dateStr,
          rentFreeDays: z.number().int().min(0).default(0),
          monthlyRent: money,
          deposit: money,
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        if (input.endDate <= input.startDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "結束日期必須遲過開始日期" });
        }
        const existing = await q.findActiveLeaseByGrid(input.gridId);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "此格仔已有生效中嘅租約" });
        }
        const id = await q.createLease(input);
        await q.setGridStatus(input.gridId, "occupied");
        return { id };
      }),
    updateLease: adminQuery
      .input(
        z.object({
          id: z.number(),
          startDate: dateStr.optional(),
          endDate: dateStr.optional(),
          rentFreeDays: z.number().int().min(0).optional(),
          monthlyRent: money.optional(),
          deposit: money.optional(),
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await q.updateLease(id, data);
        return { ok: true };
      }),
    endLease: adminQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await q.updateLease(input.id, { status: "ended" });
        const leaseRows = await q.listLeases();
        const lease = leaseRows.find((l) => l.id === input.id);
        if (lease) await q.setGridStatus(lease.gridId, "vacant");
        return { ok: true };
      }),

    // 銷售
    listSales: staffQuery
      .input(
        z.object({
          from: dateStr.optional(),
          to: dateStr.optional(),
          gridId: z.number().optional(),
          tenantId: z.number().optional(),
          /** true = 只要自己輸入嘅記錄（店員「我嘅記錄」） */
          mine: z.boolean().optional(),
        }),
      )
      .query(({ ctx, input }) => {
        const { mine, ...filters } = input;
        return q.listSales({ ...filters, createdBy: mine ? ctx.user.id : undefined }, mine ? 5000 : 500);
      }),

    /** 週結報表（星期一至日）；唔輸入就用今個星期 */
    weeklyReport: staffQuery
      .input(z.object({ weekStart: dateStr.optional() }))
      .query(({ input }) => {
        let start = input.weekStart;
        if (!start) {
          const d = new Date();
          const dow = (d.getDay() + 6) % 7; // 星期一 = 0
          d.setDate(d.getDate() - dow);
          start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
        return q.weeklyReport(start);
      }),
    /** 店員／店主記錄銷售；gridId 留空 = 店舖直銷（唔計入任何格仔） */
    createSale: staffQuery
      .input(
        z.object({
          gridId: z.number().nullish(),
          saleDate: dateStr,
          saleTime: timeStr.optional(),
          productName: z.string().min(1, "請輸入貨品名稱").max(200),
          quantity: z.number().int().min(1, "數量最少為 1"),
          unitPrice: money,
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // 店舖直銷：唔使租約
        if (input.gridId == null) {
          const total0 = (input.quantity * Number(input.unitPrice)).toFixed(2);
          return q.createSale({
            gridId: null,
            tenantId: null,
            saleDate: input.saleDate,
            saleTime: input.saleTime,
            productName: input.productName,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            totalAmount: total0,
            note: input.note ? `店舖直銷 · ${input.note}` : "店舖直銷",
            createdBy: ctx.user.id,
          });
        }
        const lease = await q.findActiveLeaseByGrid(input.gridId);
        if (!lease) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "此格仔冇生效中嘅租約，未能記錄銷售" });
        }
        const total = (input.quantity * Number(input.unitPrice)).toFixed(2);
        return q.createSale({
          gridId: input.gridId,
          tenantId: lease.tenantId,
          saleDate: input.saleDate,
          saleTime: input.saleTime,
          productName: input.productName,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          totalAmount: total,
          note: input.note,
          createdBy: ctx.user.id,
        });
      }),
    /** 店員只可以改自己建立嘅記錄；店主可以改任何記錄 */
    updateSale: staffQuery
      .input(
        z.object({
          id: z.number(),
          saleDate: dateStr.optional(),
          saleTime: timeStr.nullish(),
          productName: z.string().min(1).max(200).optional(),
          quantity: z.number().int().min(1).optional(),
          unitPrice: money.optional(),
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await assertSaleEditable(id, ctx.user);
        const patch: Parameters<typeof q.updateSale>[1] = { ...data };
        if (data.quantity !== undefined && data.unitPrice !== undefined) {
          patch.totalAmount = (data.quantity * Number(data.unitPrice)).toFixed(2);
        }
        await q.updateSale(id, patch);
        return { ok: true };
      }),
    deleteSale: staffQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertSaleEditable(input.id, ctx.user);
        await q.deleteSale(input.id);
        return { ok: true };
      }),

    // 租金／按金
    listRent: adminQuery
      .input(z.object({ month: monthStr.optional(), status: z.enum(["unpaid", "paid"]).optional() }))
      .query(({ input }) => q.listRentRecords(input)),
    /** 為某月份批量開立所有生效租約嘅租金單（已存在則略過） */
    generateMonthRent: adminQuery
      .input(z.object({ month: monthStr }))
      .mutation(async ({ input }) => {
        const all = await q.listLeases();
        const active = all.filter((l) => l.status === "active");
        let created = 0;
        let skipped = 0;
        for (const lease of active) {
          const existing = await q.findRentRecord(lease.id, input.month, "rent");
          if (existing) {
            skipped += 1;
            continue;
          }
          await q.createRentRecord({
            leaseId: lease.id,
            gridId: lease.gridId,
            tenantId: lease.tenantId,
            month: input.month,
            type: "rent",
            amount: String(lease.monthlyRent),
          });
          created += 1;
        }
        return { created, skipped };
      }),
    createRentRecord: adminQuery
      .input(
        z.object({
          leaseId: z.number(),
          month: monthStr,
          type: z.enum(["rent", "deposit"]),
          amount: money,
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const all = await q.listLeases();
        const lease = all.find((l) => l.id === input.leaseId);
        if (!lease) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到租約" });
        const existing = await q.findRentRecord(input.leaseId, input.month, input.type);
        if (existing && input.type === "rent") {
          throw new TRPCError({ code: "CONFLICT", message: "此租約該月份嘅租金記錄已存在" });
        }
        return q.createRentRecord({
          leaseId: input.leaseId,
          gridId: lease.gridId,
          tenantId: lease.tenantId,
          month: input.month,
          type: input.type,
          amount: input.amount,
          note: input.note,
        });
      }),
    markRentPaid: adminQuery
      .input(z.object({ id: z.number(), paidAt: dateStr.optional() }))
      .mutation(async ({ input }) => {
        await q.markRentPaid(input.id, input.paidAt ?? new Date().toISOString().slice(0, 10));
        return { ok: true };
      }),
    markRentUnpaid: adminQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await q.markRentUnpaid(input.id);
        return { ok: true };
      }),
    deleteRentRecord: adminQuery
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await q.deleteRentRecord(input.id);
        return { ok: true };
      }),

    // ─── CSV 匯入／匯出 ──────────────────────────────────────

    exportCsv: adminQuery
      .input(z.object({ dataset: z.enum(["sales", "grids", "leases", "rent", "tenants"]) }))
      .mutation(async ({ input }) => {
        switch (input.dataset) {
          case "sales": {
            const rows = await q.listSales({}, 10000);
            const csv = toCsv(
              ["saleDate", "saleTime", "gridCode", "tenantName", "productName", "quantity", "unitPrice", "totalAmount", "note"],
              rows.map((r) => [
                r.saleDate,
                r.saleTime ?? "",
                r.gridCode ?? "店舖直銷",
                r.tenantName ?? "",
                r.productName,
                r.quantity,
                r.unitPrice,
                r.totalAmount,
                r.note,
              ]),
            );
            return { filename: "sales.csv", csv };
          }
          case "grids": {
            const rows = await q.listGrids();
            const csv = toCsv(
              ["code", "size", "monthlyRent", "status"],
              rows.map((r) => [r.code, r.size, r.monthlyRent, r.status]),
            );
            return { filename: "grids.csv", csv };
          }
          case "leases": {
            const rows = await q.listLeases();
            const csv = toCsv(
              ["gridCode", "tenantName", "startDate", "endDate", "rentFreeDays", "monthlyRent", "deposit", "status", "note"],
              rows.map((r) => [r.gridCode, r.tenantName, r.startDate, r.endDate, r.rentFreeDays, r.monthlyRent, r.deposit, r.status, r.note]),
            );
            return { filename: "leases.csv", csv };
          }
          case "rent": {
            const rows = await q.listRentRecords();
            const csv = toCsv(
              ["month", "type", "gridCode", "tenantName", "amount", "status", "paidAt", "note"],
              rows.map((r) => [r.month, r.type, r.gridCode, r.tenantName, r.amount, r.status, r.paidAt, r.note]),
            );
            return { filename: "rent_records.csv", csv };
          }
          case "tenants": {
            const rows = await q.listTenants();
            const csv = toCsv(
              ["name", "phone", "email", "note"],
              rows.map((r) => [r.name, r.phone, r.email, r.note]),
            );
            return { filename: "tenants.csv", csv };
          }
        }
      }),

    /**
     * 匯入銷售 CSV（v2 標準格式）：交易日期,交易時間,格仔編號,商品名稱,數量,單價,備註
     * 格仔編號留空 = 店舖直銷（唔計入任何格仔）；銷售金額 = 數量 × 單價，系統自動計
     */
    importSales: staffQuery
      .input(
        z.object({
          rows: z
            .array(
              z.object({
                saleDate: z.string(),
                saleTime: z.string().optional(),
                gridCode: z.string(),
                productName: z.string(),
                quantity: z.string(),
                unitPrice: z.string(),
                note: z.string().optional(),
              }),
            )
            .max(2000, "每次最多匯入 2000 行"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const errors: { row: number; message: string }[] = [];
        let inserted = 0;
        let directCount = 0;
        for (let i = 0; i < input.rows.length; i++) {
          const r = input.rows[i];
          const rowNo = i + 2; // 計及標題行
          if (!/^\d{4}-\d{2}-\d{2}$/.test(r.saleDate)) {
            errors.push({ row: rowNo, message: `日期格式錯誤：${r.saleDate}` });
            continue;
          }
          const time = (r.saleTime ?? "").trim();
          if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            errors.push({ row: rowNo, message: `時間格式錯誤：${time}（須為 HH:MM）` });
            continue;
          }
          const qty = parseInt(r.quantity, 10);
          const price = Number(r.unitPrice);
          if (!r.productName.trim()) {
            errors.push({ row: rowNo, message: "貨品名稱空白" });
            continue;
          }
          if (!Number.isFinite(qty) || qty < 1) {
            errors.push({ row: rowNo, message: `數量錯誤：${r.quantity}` });
            continue;
          }
          if (!Number.isFinite(price) || price < 0) {
            errors.push({ row: rowNo, message: `單價錯誤：${r.unitPrice}` });
            continue;
          }
          const rawCode = r.gridCode.trim();
          // 格仔編號留空 = 店舖直銷
          if (!rawCode) {
            await q.createSale({
              gridId: null,
              tenantId: null,
              saleDate: r.saleDate,
              saleTime: time || null,
              productName: r.productName.trim(),
              quantity: qty,
              unitPrice: price.toFixed(2),
              totalAmount: (qty * price).toFixed(2),
              note: r.note?.trim() ? `店舖直銷 · ${r.note.trim()}` : "店舖直銷",
              createdBy: ctx.user.id,
            });
            inserted += 1;
            directCount += 1;
            continue;
          }
          const code = normalizeGridCode(rawCode);
          const grid = await q.findGridByCode(code);
          if (!grid) {
            errors.push({ row: rowNo, message: `搵唔到格仔：${rawCode}（編號 001–070，留空 = 店舖直銷）` });
            continue;
          }
          const lease = await q.findActiveLeaseByGrid(grid.id);
          if (!lease) {
            errors.push({ row: rowNo, message: `格仔 ${grid.code} 冇生效中嘅租約` });
            continue;
          }
          await q.createSale({
            gridId: grid.id,
            tenantId: lease.tenantId,
            saleDate: r.saleDate,
            saleTime: time || null,
            productName: r.productName.trim(),
            quantity: qty,
            unitPrice: price.toFixed(2),
            totalAmount: (qty * price).toFixed(2),
            note: r.note?.trim() || undefined,
            createdBy: ctx.user.id,
          });
          inserted += 1;
        }
        return { inserted, directCount, errors };
      }),

    /**
     * 匯入 POS「商品銷售_明細」CSV（Day Day New 格式）
     * 格式：第 1 行標題（含日期範圍）、第 2 行記錄數、第 3 行欄位名、之後數據、最後「合計」行
     * 欄位：行號,商品編號,商品名稱,規格,數量,銷售金額,商品分類,...
     * 由於原檔冇每日日期亦冇格號，全部記錄會掛落 admin 揀定嘅格仔 + 指定日期
     */
    /**
     * 匯入 POS「商品銷售_明細」CSV（Day Day New 收銀機原檔，唔使改格式）：
     * - 標題行「日期 2026-07-01 10-00-00至2026-07-31 10-00-00」→ 銷售期間
     * - 「商品分類」係「NN格」→ 計入格仔 0NN（有生效租約就計入該租戶）；其他分類 → 店舖直銷
     * - 「格仔租金」分類（租金／按金）唔係銷售，自動略過
     * - 「合計」行略過；單價 = 銷售金額 ÷ 數量
     * - 同一期間嘅檔案只可以匯入一次（防止重複計數）
     */
    importPosSales: staffQuery
      .input(
        z.object({
          saleDate: dateStr,
          csvText: z.string().min(1, "CSV 內容為空").max(4_000_000, "檔案太大（上限 4MB）"),
          dryRun: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const parsed = parsePosCsv(input.csvText);
        if ("error" in parsed) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error });
        const { period, items, errors, skippedRent } = parsed;

        // 格仔 + 生效租約
        const grids = await q.listGrids();
        const gridByCode = new Map(grids.map((g) => [g.code, g]));
        const leaseByGrid = new Map<number, Awaited<ReturnType<typeof q.findActiveLeaseByGrid>>>();
        const warnings: string[] = [];
        const rows: Parameters<typeof q.createSalesBatch>[0] = [];
        const byGrid = new Map<string, { qty: number; amount: number; count: number; tenantName: string | null }>();
        let directCount = 0;

        for (const it of items) {
          let gridId: number | null = null;
          let tenantId: number | null = null;
          let gridCode: string | null = null;
          if (it.gridCode) {
            const g = gridByCode.get(it.gridCode);
            if (!g) {
              errors.push({ row: it.row, message: `商品分類「${it.category}」對應嘅格仔 ${it.gridCode} 唔存在` });
              continue;
            }
            if (!leaseByGrid.has(g.id)) leaseByGrid.set(g.id, await q.findActiveLeaseByGrid(g.id));
            const lease = leaseByGrid.get(g.id);
            gridId = g.id;
            gridCode = g.code;
            tenantId = lease?.tenantId ?? null;
          } else {
            directCount++;
          }
          rows.push({
            gridId,
            tenantId,
            saleDate: input.saleDate,
            productName: it.name,
            quantity: it.qty,
            unitPrice: it.unitPrice,
            totalAmount: it.amount,
            note: it.note,
            createdBy: ctx.user.id,
          });
          const key = gridCode ?? "店舖直銷";
          const agg = byGrid.get(key) ?? { qty: 0, amount: 0, count: 0, tenantName: null };
          agg.qty += it.qty;
          agg.amount += Number(it.amount);
          agg.count += 1;
          byGrid.set(key, agg);
        }

        // 租戶名 + 未有租約警告
        const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((x): x is number => x != null))];
        const tenantNames = new Map<number, string>();
        for (const id of tenantIds) tenantNames.set(id, (await q.findTenantById(id))?.name ?? "");
        for (const [code, agg] of byGrid) {
          if (code === "店舖直銷") continue;
          const r = rows.find((x) => x.gridId === gridByCode.get(code)?.id);
          agg.tenantName = r?.tenantId ? tenantNames.get(r.tenantId) ?? null : null;
          if (!r?.tenantId) warnings.push(`格仔 ${code} 未有生效租約：${agg.count} 筆已記錄喺格仔，但未計入任何租戶`);
        }

        // 防止重複匯入同一期間
        const sourceTag = period ? `POS ${period.start}~${period.end}` : null;
        if (sourceTag && (await q.countSalesWithNotePrefix(`[${sourceTag}]`)) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${period!.start} 至 ${period!.end} 嘅 POS 檔已經匯入過。如要重新匯入，請先喺銷售記錄刪除舊資料`,
          });
        }
        if (sourceTag) for (const r of rows) r.note = `[${sourceTag}] ${r.note}`;

        const summary = {
          period,
          saleDate: input.saleDate,
          count: rows.length,
          directCount,
          skippedRent,
          totalQty: rows.reduce((a, r) => a + r.quantity, 0),
          totalAmount: rows.reduce((a, r) => a + Number(r.totalAmount), 0).toFixed(2),
          byGrid: [...byGrid.entries()]
            .map(([code, a]) => ({ code, tenantName: a.tenantName, count: a.count, qty: a.qty, amount: a.amount.toFixed(2) }))
            .sort((a, b) => (a.code === "店舖直銷" ? 1 : b.code === "店舖直銷" ? -1 : a.code.localeCompare(b.code))),
          warnings,
          errors,
        };
        if (input.dryRun) return { ...summary, inserted: 0 };
        await q.createSalesBatch(rows);
        return { ...summary, inserted: rows.length };
      }),

    /** 匯入格仔 CSV：欄位 code,size,monthlyRent */
    importGrids: adminQuery
      .input(
        z.object({
          rows: z
            .array(z.object({ code: z.string(), size: z.string(), monthlyRent: z.string() }))
            .max(1000, "每次最多匯入 1000 行"),
        }),
      )
      .mutation(async ({ input }) => {
        const errors: { row: number; message: string }[] = [];
        let inserted = 0;
        for (let i = 0; i < input.rows.length; i++) {
          const r = input.rows[i];
          const rowNo = i + 2;
          const code = r.code.trim().toUpperCase();
          const size = r.size.trim().toUpperCase();
          const rent = Number(r.monthlyRent);
          if (!code) {
            errors.push({ row: rowNo, message: "格仔編號空白" });
            continue;
          }
          if (!["M", "L"].includes(size)) {
            errors.push({ row: rowNo, message: `尺寸須為 M/L：${r.size}` });
            continue;
          }
          if (!Number.isFinite(rent) || rent < 0) {
            errors.push({ row: rowNo, message: `租金錯誤：${r.monthlyRent}` });
            continue;
          }
          const existing = await q.findGridByCode(code);
          if (existing) {
            errors.push({ row: rowNo, message: `格仔編號 ${code} 已存在` });
            continue;
          }
          await q.createGrid({ code, size: size as "M" | "L", monthlyRent: rent.toFixed(2) });
          inserted += 1;
        }
        return { inserted, errors };
      }),
  }),
});

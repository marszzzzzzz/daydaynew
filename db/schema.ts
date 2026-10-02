import { boolean, index, integer, numeric, pgSchema, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Postgres（Supabase）schema。
 * 全部表放喺獨立 schema「gridbox」，唔會同 Supabase public schema 入面其他表撞名，
 * 亦唔會經 Supabase REST API（PostgREST 預設只開放 public）對外暴露。
 * 金額用 numeric(12,2)，Drizzle 讀出嚟係字串（"500.00"），避免浮點誤差。
 * 日期欄用 text「YYYY-MM-DD」、時間欄用 text「HH:MM」（字典序 = 時序）。
 */
export const gridbox = pgSchema("gridbox");

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const createdAt = () => timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** 用戶（用戶名 + 密碼登入） */
export const users = gridbox.table("users", {
  id: serial("id").primaryKey(),
  /** 登入識別：local:<用戶名細楷> */
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  avatar: text("avatar"),
  passwordHash: text("passwordHash"),
  /** user=租客（唯讀） staff=店員（上載/改自己記錄/睇報表） admin=店主（全權） */
  role: text("role").$type<"user" | "staff" | "admin">().notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignInAt: timestamp("lastSignInAt", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
/** 可以安全傳去瀏覽器嘅用戶資料（冇 passwordHash） */
export type PublicUser = Omit<User, "passwordHash">;

/** 租戶檔案（由店主建立；可連結到登入戶口） */
export const tenants = gridbox.table("tenants", {
  id: serial("id").primaryKey(),
  /** 連結到 users.id；未連結為 null */
  userId: integer("userId"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/** 格仔 */
export const grids = gridbox.table(
  "grids",
  {
    id: serial("id").primaryKey(),
    /** 格仔編號 001–070 */
    code: text("code").notNull().unique(),
    size: text("size").$type<"M" | "L">().notNull().default("M"),
    /** 月租（港幣） */
    monthlyRent: money("monthlyRent").notNull().default("0"),
    status: text("status").$type<"vacant" | "occupied" | "reserved">().notNull().default("vacant"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("grids_status_idx").on(table.status)],
);

export type Grid = typeof grids.$inferSelect;
export type InsertGrid = typeof grids.$inferInsert;

/** 租約（一格同一時間只應有一份 active 租約） */
export const leases = gridbox.table(
  "leases",
  {
    id: serial("id").primaryKey(),
    gridId: integer("gridId").notNull(),
    tenantId: integer("tenantId").notNull(),
    startDate: text("startDate").notNull(),
    endDate: text("endDate").notNull(),
    /** 免租期日數 */
    rentFreeDays: integer("rentFreeDays").notNull().default(0),
    monthlyRent: money("monthlyRent").notNull(),
    deposit: money("deposit").notNull(),
    status: text("status").$type<"active" | "ended">().notNull().default("active"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("leases_grid_idx").on(table.gridId), index("leases_tenant_idx").on(table.tenantId)],
);

export type Lease = typeof leases.$inferSelect;
export type InsertLease = typeof leases.$inferInsert;

/** 每日銷售記錄；gridId/tenantId 為 null = 店舖直銷（唔計入任何格仔） */
export const sales = gridbox.table(
  "sales",
  {
    id: serial("id").primaryKey(),
    gridId: integer("gridId"),
    tenantId: integer("tenantId"),
    /** 日期 YYYY-MM-DD */
    saleDate: text("saleDate").notNull(),
    /** 交易時間 HH:MM（可留空） */
    saleTime: text("saleTime"),
    productName: text("productName").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: money("unitPrice").notNull(),
    totalAmount: money("totalAmount").notNull(),
    note: text("note"),
    createdBy: integer("createdBy"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("sales_date_idx").on(table.saleDate),
    index("sales_grid_idx").on(table.gridId),
    index("sales_tenant_idx").on(table.tenantId),
  ],
);

export type Sale = typeof sales.$inferSelect;
export type InsertSale = typeof sales.$inferInsert;

/** 租金 / 按金記錄（每月每租約一條 rent；簽約時一條 deposit） */
export const rentRecords = gridbox.table(
  "rent_records",
  {
    id: serial("id").primaryKey(),
    leaseId: integer("leaseId").notNull(),
    gridId: integer("gridId").notNull(),
    tenantId: integer("tenantId").notNull(),
    /** 月份 YYYY-MM */
    month: text("month").notNull(),
    type: text("type").$type<"rent" | "deposit">().notNull(),
    amount: money("amount").notNull(),
    status: text("status").$type<"unpaid" | "paid">().notNull().default("unpaid"),
    paidAt: text("paidAt"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("rent_month_idx").on(table.month), index("rent_lease_idx").on(table.leaseId)],
);

export type RentRecord = typeof rentRecords.$inferSelect;
export type InsertRentRecord = typeof rentRecords.$inferInsert;

/** 兼職員工（店主管理；唔一定有登入戶口） */
export const employees = gridbox.table("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  /** 預設時薪（新增更表時帶入；每更會另外記低當時時薪） */
  hourlyRate: money("hourlyRate").notNull(),
  /** 有冇參加強積金（受僱少於 60 日可豁免） */
  mpfEnrolled: boolean("mpfEnrolled").notNull().default(true),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Employee = typeof employees.$inferSelect;

/** 返工記錄（每更） */
export const shifts = gridbox.table(
  "shifts",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employeeId").notNull(),
    /** YYYY-MM-DD */
    workDate: text("workDate").notNull(),
    /** HH:MM；落更早過返工 = 跨午夜 */
    startTime: text("startTime").notNull(),
    endTime: text("endTime").notNull(),
    breakMinutes: integer("breakMinutes").notNull().default(0),
    /** 呢更嘅時薪（快照，之後加人工唔會改舊記錄） */
    hourlyRate: money("hourlyRate").notNull(),
    note: text("note"),
    createdBy: integer("createdBy"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("shifts_emp_date_idx").on(table.employeeId, table.workDate)],
);

export type Shift = typeof shifts.$inferSelect;

/** 已出糧記錄（每人每月一條；出糧後該月更表鎖定，數字凍結） */
export const payrollPayments = gridbox.table(
  "payroll_payments",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employeeId").notNull(),
    /** YYYY-MM */
    month: text("month").notNull(),
    hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
    basePay: money("basePay").notNull(),
    adjustment: money("adjustment").notNull().default("0"),
    grossPay: money("grossPay").notNull(),
    mpfEmployee: money("mpfEmployee").notNull(),
    mpfEmployer: money("mpfEmployer").notNull(),
    netPay: money("netPay").notNull(),
    paidAt: text("paidAt").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("payroll_emp_month_uq").on(table.employeeId, table.month)],
);

export type PayrollPayment = typeof payrollPayments.$inferSelect;

export const ALL_TABLES = ["users", "tenants", "grids", "leases", "sales", "rent_records", "employees", "shifts", "payroll_payments"] as const;

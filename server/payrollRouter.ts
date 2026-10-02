import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { employees, shifts, payrollPayments } from "@db/schema";
import { computeMonthPay, MIN_WAGE_HKD, MPF } from "@contracts/payroll";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式須為 YYYY-MM-DD");
const monthStr = z.string().regex(/^\d{4}-\d{2}$/, "月份格式須為 YYYY-MM");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時間格式須為 HH:MM（24 小時制）");
const rate = z.number().min(0, "時薪不可為負數").max(10000, "時薪太大");

async function findPayment(employeeId: number, month: string) {
  const [p] = await getDb()
    .select()
    .from(payrollPayments)
    .where(and(eq(payrollPayments.employeeId, employeeId), eq(payrollPayments.month, month)))
    .limit(1);
  return p ?? null;
}

/** 已出糧嘅月份唔可以再改更表（數字已凍結） */
async function assertMonthOpen(employeeId: number, workDate: string) {
  const month = workDate.slice(0, 7);
  if (await findPayment(employeeId, month)) {
    throw new TRPCError({ code: "CONFLICT", message: `${month} 已經出糧，更表已鎖定。如要修改，請先「取消出糧」` });
  }
}

async function shiftsOf(month: string, employeeId?: number) {
  const conds = [like(shifts.workDate, `${month}%`)];
  if (employeeId) conds.push(eq(shifts.employeeId, employeeId));
  return getDb()
    .select()
    .from(shifts)
    .where(and(...conds))
    .orderBy(asc(shifts.workDate), asc(shifts.startTime));
}

export const payrollRouter = createRouter({
  /** 規則常數（畀頁面顯示） */
  rules: adminQuery.query(() => ({ minWage: MIN_WAGE_HKD, mpf: MPF })),

  // ─── 員工 ─────────────────────────────────────────
  listEmployees: adminQuery.query(() => getDb().select().from(employees).orderBy(asc(employees.name))),

  createEmployee: adminQuery
    .input(
      z.object({
        name: z.string().trim().min(1, "請輸入員工姓名").max(50),
        phone: z.string().max(30).optional(),
        hourlyRate: rate,
        mpfEnrolled: z.boolean().default(true),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [row] = await getDb()
        .insert(employees)
        .values({ ...input, hourlyRate: input.hourlyRate.toFixed(2) })
        .returning({ id: employees.id });
      return row;
    }),

  updateEmployee: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(50).optional(),
        phone: z.string().max(30).optional(),
        hourlyRate: rate.optional(),
        mpfEnrolled: z.boolean().optional(),
        active: z.boolean().optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, hourlyRate, ...rest } = input;
      await getDb()
        .update(employees)
        .set({ ...rest, ...(hourlyRate !== undefined ? { hourlyRate: hourlyRate.toFixed(2) } : {}) })
        .where(eq(employees.id, id));
      return { ok: true };
    }),

  /** 冇任何更表嘅員工先可以刪；有記錄嘅請改做「停用」 */
  deleteEmployee: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [c] = await getDb().select({ n: sql<number>`count(*)` }).from(shifts).where(eq(shifts.employeeId, input.id));
    if (Number(c?.n ?? 0) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "呢位員工已有返工記錄，唔可以刪除；請改為「停用」" });
    }
    await getDb().delete(employees).where(eq(employees.id, input.id));
    return { ok: true };
  }),

  // ─── 更表 ─────────────────────────────────────────
  listShifts: adminQuery
    .input(z.object({ month: monthStr, employeeId: z.number().optional() }))
    .query(({ input }) => shiftsOf(input.month, input.employeeId)),

  createShift: adminQuery
    .input(
      z.object({
        employeeId: z.number(),
        workDate: dateStr,
        startTime: timeStr,
        endTime: timeStr,
        breakMinutes: z.number().int().min(0).max(600).default(0),
        /** 唔填就用員工預設時薪 */
        hourlyRate: rate.optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [emp] = await getDb().select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢位員工" });
      if (input.startTime === input.endTime) throw new TRPCError({ code: "BAD_REQUEST", message: "返工同落更時間唔可以一樣" });
      await assertMonthOpen(emp.id, input.workDate);
      const [row] = await getDb()
        .insert(shifts)
        .values({
          ...input,
          hourlyRate: input.hourlyRate !== undefined ? input.hourlyRate.toFixed(2) : emp.hourlyRate,
          createdBy: ctx.user.id,
        })
        .returning({ id: shifts.id });
      return row;
    }),

  updateShift: adminQuery
    .input(
      z.object({
        id: z.number(),
        workDate: dateStr,
        startTime: timeStr,
        endTime: timeStr,
        breakMinutes: z.number().int().min(0).max(600),
        hourlyRate: rate,
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [old] = await getDb().select().from(shifts).where(eq(shifts.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢更" });
      await assertMonthOpen(old.employeeId, old.workDate);
      await assertMonthOpen(old.employeeId, input.workDate);
      const { id, hourlyRate, ...rest } = input;
      await getDb()
        .update(shifts)
        .set({ ...rest, hourlyRate: hourlyRate.toFixed(2) })
        .where(eq(shifts.id, id));
      return { ok: true };
    }),

  deleteShift: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [old] = await getDb().select().from(shifts).where(eq(shifts.id, input.id)).limit(1);
    if (!old) return { ok: true };
    await assertMonthOpen(old.employeeId, old.workDate);
    await getDb().delete(shifts).where(eq(shifts.id, input.id));
    return { ok: true };
  }),

  // ─── 月結 ─────────────────────────────────────────
  /** 每位員工當月人工：已出糧 = 用凍結數字；未出糧 = 按更表即時計 */
  monthSummary: adminQuery.input(z.object({ month: monthStr })).query(async ({ input }) => {
    const db = getDb();
    const emps = await db.select().from(employees).orderBy(asc(employees.name));
    const monthShifts = await shiftsOf(input.month);
    const paid = await db.select().from(payrollPayments).where(eq(payrollPayments.month, input.month));
    const paidBy = new Map(paid.map((p) => [p.employeeId, p]));

    const rows = emps
      .map((e) => {
        const p = paidBy.get(e.id);
        const mine = monthShifts.filter((s) => s.employeeId === e.id);
        const calc = computeMonthPay(mine, e.mpfEnrolled);
        if (p) {
          return {
            employeeId: e.id,
            name: e.name,
            mpfEnrolled: e.mpfEnrolled,
            shifts: mine.length,
            hours: Number(p.hours),
            base: Number(p.basePay),
            adjustment: Number(p.adjustment),
            gross: Number(p.grossPay),
            mpfEmployee: Number(p.mpfEmployee),
            mpfEmployer: Number(p.mpfEmployer),
            net: Number(p.netPay),
            belowMinWage: calc.belowMinWage,
            paid: { paidAt: p.paidAt, note: p.note },
          };
        }
        return { employeeId: e.id, name: e.name, mpfEnrolled: e.mpfEnrolled, ...calc, paid: null };
      })
      // 停用而且當月冇返工嘅員工唔顯示
      .filter((r) => r.shifts > 0 || r.paid || emps.find((e) => e.id === r.employeeId)?.active);

    const sum = (k: "hours" | "gross" | "mpfEmployee" | "mpfEmployer" | "net") =>
      Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;
    return {
      month: input.month,
      rows,
      totals: {
        hours: sum("hours"),
        gross: sum("gross"),
        mpfEmployee: sum("mpfEmployee"),
        mpfEmployer: sum("mpfEmployer"),
        net: sum("net"),
        /** 店舖總人工成本 = 總人工 + 僱主強積金 */
        employerCost: Math.round((sum("gross") + sum("mpfEmployer")) * 100) / 100,
      },
    };
  }),

  /** 出糧：按當時更表計算並凍結，該月更表之後唔可以改 */
  markPaid: adminQuery
    .input(
      z.object({
        employeeId: z.number(),
        month: monthStr,
        paidAt: dateStr,
        /** 法定假日薪酬、獎金（+）或扣減（−） */
        adjustment: z.number().min(-100000).max(100000).default(0),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [emp] = await getDb().select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢位員工" });
      if (await findPayment(emp.id, input.month)) {
        throw new TRPCError({ code: "CONFLICT", message: `${emp.name} ${input.month} 已經出咗糧` });
      }
      const mine = await shiftsOf(input.month, emp.id);
      if (mine.length === 0 && input.adjustment === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${emp.name} ${input.month} 冇返工記錄` });
      }
      const c = computeMonthPay(mine, emp.mpfEnrolled, input.adjustment);
      if (c.gross < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "扣減後人工唔可以少過 0" });
      await getDb().insert(payrollPayments).values({
        employeeId: emp.id,
        month: input.month,
        hours: c.hours.toFixed(2),
        basePay: c.base.toFixed(2),
        adjustment: c.adjustment.toFixed(2),
        grossPay: c.gross.toFixed(2),
        mpfEmployee: c.mpfEmployee.toFixed(2),
        mpfEmployer: c.mpfEmployer.toFixed(2),
        netPay: c.net.toFixed(2),
        paidAt: input.paidAt,
        note: input.note,
      });
      return c;
    }),

  /** 取消出糧：解鎖該月更表（例如發現更表輸入錯咗） */
  unmarkPaid: adminQuery
    .input(z.object({ employeeId: z.number(), month: monthStr }))
    .mutation(async ({ input }) => {
      await getDb()
        .delete(payrollPayments)
        .where(and(eq(payrollPayments.employeeId, input.employeeId), eq(payrollPayments.month, input.month)));
      return { ok: true };
    }),
});

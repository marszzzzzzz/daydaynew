import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { employees, shifts, payrollPayments, attendance } from "@db/schema";
import { computeMonthPay, shiftPay, MIN_WAGE_HKD } from "@contracts/payroll";
import { parseAttendanceCsv } from "@contracts/attendance";
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

/** 工號唔可以同其他員工重複 */
async function assertStaffCodeFree(code: string | undefined, selfId?: number) {
  if (!code) return;
  const [other] = await getDb().select().from(employees).where(eq(employees.staffCode, code)).limit(1);
  if (other && other.id !== selfId) {
    throw new TRPCError({ code: "CONFLICT", message: `工號 ${code} 已經屬於 ${other.name}` });
  }
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

async function attendanceOf(month: string, employeeId?: number) {
  const conds = [eq(attendance.month, month)];
  if (employeeId) conds.push(eq(attendance.employeeId, employeeId));
  return getDb()
    .select()
    .from(attendance)
    .where(and(...conds));
}

const staffCodeStr = z.string().trim().regex(/^\d{1,10}$/, "工號只可以係數字").optional().or(z.literal(""));

export const payrollRouter = createRouter({
  /** 規則常數（畀頁面顯示） */
  rules: adminQuery.query(() => ({ minWage: MIN_WAGE_HKD })),

  // ─── 員工 ─────────────────────────────────────────
  listEmployees: adminQuery.query(() => getDb().select().from(employees).orderBy(asc(employees.name))),

  createEmployee: adminQuery
    .input(
      z.object({
        name: z.string().trim().min(1, "請輸入員工姓名").max(50),
        staffCode: staffCodeStr,
        phone: z.string().max(30).optional(),
        hourlyRate: rate,
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await assertStaffCodeFree(input.staffCode);
      const [row] = await getDb()
        .insert(employees)
        .values({ ...input, staffCode: input.staffCode || null, mpfEnrolled: false, hourlyRate: input.hourlyRate.toFixed(2) })
        .returning({ id: employees.id });
      return row;
    }),

  updateEmployee: adminQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(50).optional(),
        staffCode: staffCodeStr,
        phone: z.string().max(30).optional(),
        hourlyRate: rate.optional(),
        active: z.boolean().optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, hourlyRate, staffCode, ...rest } = input;
      if (staffCode !== undefined) await assertStaffCodeFree(staffCode, id);
      await getDb()
        .update(employees)
        .set({
          ...rest,
          ...(staffCode !== undefined ? { staffCode: staffCode || null } : {}),
          ...(hourlyRate !== undefined ? { hourlyRate: hourlyRate.toFixed(2) } : {}),
        })
        .where(eq(employees.id, id));
      return { ok: true };
    }),

  /** 冇任何更表嘅員工先可以刪；有記錄嘅請改做「停用」 */
  deleteEmployee: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [c] = await getDb().select({ n: sql<number>`count(*)` }).from(shifts).where(eq(shifts.employeeId, input.id));
    const [a] = await getDb().select({ n: sql<number>`count(*)` }).from(attendance).where(eq(attendance.employeeId, input.id));
    if (Number(c?.n ?? 0) + Number(a?.n ?? 0) > 0) {
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

  // ─── 考勤匯入 ─────────────────────────────────────
  /**
   * 匯入考勤機「員工考勤_明細」CSV：每人每月一條總工時 → 自動計人工。
   * dryRun = 只預覽（對應員工、工時、人工）；正式匯入會：
   *   - 新工號 → 自動新增員工（要畀時薪）；舊員工按工號對應，冇工號就按名
   *   - 同月已經匯入過 → 覆蓋（唔會重複計）
   *   - 已出糧嘅員工 → 跳過（數字已凍結）
   */
  importAttendance: adminQuery
    .input(
      z.object({
        csvText: z.string().min(1, "CSV 係空嘅").max(500_000, "CSV 太大"),
        /** 唔填就用檔頭日期範圍推算 */
        month: monthStr.optional(),
        /** 新員工嘅時薪：key = 工號（冇工號就用名） */
        newRates: z.record(z.string(), rate).default({}),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parsed = parseAttendanceCsv(input.csvText);
      if (parsed.errors.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `CSV 有問題，未匯入：\n${parsed.errors.slice(0, 8).join("\n")}` });
      }
      const month = input.month ?? parsed.month;
      if (!month) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV 入面搵唔到日期範圍，請揀月份" });
      const period = parsed.periodFrom && parsed.periodTo ? `${parsed.periodFrom} 至 ${parsed.periodTo}` : null;

      const db = getDb();
      const emps = await db.select().from(employees);
      const existing = await attendanceOf(month);
      const paidIds = new Set((await db.select().from(payrollPayments).where(eq(payrollPayments.month, month))).map((p) => p.employeeId));
      const manual = await shiftsOf(month);

      const rows = parsed.rows.map((r) => {
        const byCode = r.code ? emps.find((e) => e.staffCode === r.code) : undefined;
        const byName = byCode
          ? undefined
          : emps.find((e) => e.name.trim().toLowerCase() === r.name.toLowerCase() && (!e.staffCode || !r.code || e.staffCode === r.code));
        const emp = byCode ?? byName ?? null;
        const key = r.code || r.name;
        const newRate = input.newRates[key];
        const hourlyRate = emp ? Number(emp.hourlyRate) : newRate ?? null;
        const prev = emp ? existing.find((a) => a.employeeId === emp.id) : undefined;
        return {
          ...r,
          key,
          employeeId: emp?.id ?? null,
          employeeName: emp?.name ?? null,
          matchedBy: byCode ? ("code" as const) : byName ? ("name" as const) : null,
          hourlyRate,
          pay: hourlyRate === null ? null : shiftPay(r.hours, hourlyRate),
          status: !emp ? ("new" as const) : paidIds.has(emp.id) ? ("locked" as const) : prev ? ("replace" as const) : ("create" as const),
          previous: prev ? { hours: Number(prev.hours), pay: shiftPay(Number(prev.hours), Number(prev.hourlyRate)) } : null,
          /** 同月仲有手動輸入嘅更（會一齊計，小心重複） */
          manualShifts: emp ? manual.filter((s) => s.employeeId === emp.id).length : 0,
          belowMinWage: hourlyRate !== null && hourlyRate < MIN_WAGE_HKD,
        };
      });
      const inFile = new Set(rows.map((r) => r.employeeId).filter(Boolean));
      const keptOthers = existing.filter((a) => !inFile.has(a.employeeId)).length;
      const summary = {
        month,
        period,
        rows,
        keptOthers,
        total: {
          hours: Math.round(rows.reduce((a, r) => a + r.hours, 0) * 100) / 100,
          pay: Math.round(rows.reduce((a, r) => a + (r.status === "locked" ? 0 : r.pay ?? 0), 0) * 100) / 100,
        },
      };
      if (input.dryRun) return { ...summary, imported: 0, created: 0, skipped: 0 };

      const missing = rows.filter((r) => r.status === "new" && r.hourlyRate === null);
      if (missing.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `請先填新員工嘅時薪：${missing.map((r) => `${r.code ? r.code + "-" : ""}${r.name}`).join("、")}` });
      }

      let imported = 0;
      let created = 0;
      await db.transaction(async (tx) => {
        for (const r of rows) {
          if (r.status === "locked") continue;
          let employeeId = r.employeeId;
          if (employeeId === null) {
            const [e] = await tx
              .insert(employees)
              .values({ name: r.name, staffCode: r.code || null, hourlyRate: r.hourlyRate!.toFixed(2), mpfEnrolled: false, note: "考勤匯入自動新增" })
              .returning({ id: employees.id });
            employeeId = e.id;
            created++;
          } else if (r.matchedBy === "name" && r.code) {
            // 按名對應到嘅舊員工：記低工號，下次直接用工號對
            await tx.update(employees).set({ staffCode: r.code }).where(eq(employees.id, employeeId));
          }
          const values = {
            shiftCount: r.shiftCount,
            seconds: r.seconds,
            hours: r.hours.toFixed(2),
            hourlyRate: r.hourlyRate!.toFixed(2),
            period,
            createdBy: ctx.user.id,
          };
          await tx
            .insert(attendance)
            .values({ employeeId, month, ...values })
            .onConflictDoUpdate({ target: [attendance.employeeId, attendance.month], set: { ...values, updatedAt: new Date() } });
          imported++;
        }
      });
      return { ...summary, imported, created, skipped: rows.filter((r) => r.status === "locked").length };
    }),

  listAttendance: adminQuery.input(z.object({ month: monthStr })).query(async ({ input }) => {
    const db = getDb();
    const rows = await attendanceOf(input.month);
    if (!rows.length) return [];
    const emps = await db.select().from(employees).where(inArray(employees.id, rows.map((r) => r.employeeId)));
    const paidIds = new Set((await db.select().from(payrollPayments).where(eq(payrollPayments.month, input.month))).map((p) => p.employeeId));
    return rows
      .map((a) => {
        const e = emps.find((x) => x.id === a.employeeId);
        return {
          ...a,
          employeeName: e?.name ?? `#${a.employeeId}`,
          staffCode: e?.staffCode ?? null,
          pay: shiftPay(Number(a.hours), Number(a.hourlyRate)),
          locked: paidIds.has(a.employeeId),
        };
      })
      .sort((x, y) => (x.staffCode ?? x.employeeName).localeCompare(y.staffCode ?? y.employeeName));
  }),

  deleteAttendance: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [old] = await getDb().select().from(attendance).where(eq(attendance.id, input.id)).limit(1);
    if (!old) return { ok: true };
    await assertMonthOpen(old.employeeId, `${old.month}-01`);
    await getDb().delete(attendance).where(eq(attendance.id, input.id));
    return { ok: true };
  }),

  // ─── 月結 ─────────────────────────────────────────
  /** 每位員工當月人工：已出糧 = 用凍結數字；未出糧 = 按考勤 + 更表即時計 */
  monthSummary: adminQuery.input(z.object({ month: monthStr })).query(async ({ input }) => {
    const db = getDb();
    const emps = await db.select().from(employees).orderBy(asc(employees.name));
    const monthShifts = await shiftsOf(input.month);
    const monthAtt = await attendanceOf(input.month);
    const paid = await db.select().from(payrollPayments).where(eq(payrollPayments.month, input.month));
    const paidBy = new Map(paid.map((p) => [p.employeeId, p]));

    const rows = emps
      .map((e) => {
        const p = paidBy.get(e.id);
        const mine = monthShifts.filter((s) => s.employeeId === e.id);
        const att = monthAtt.find((a) => a.employeeId === e.id) ?? null;
        const calc = computeMonthPay(mine, att);
        const sources = { attendanceHours: att ? Number(att.hours) : 0, manualShifts: mine.length };
        const base = { employeeId: e.id, name: e.name, staffCode: e.staffCode, active: e.active, sources };
        if (p) {
          return {
            ...base,
            shifts: calc.shifts,
            hours: Number(p.hours),
            base: Number(p.basePay),
            adjustment: Number(p.adjustment),
            gross: Number(p.grossPay),
            belowMinWage: calc.belowMinWage,
            paid: { paidAt: p.paidAt, note: p.note },
          };
        }
        return { ...base, ...calc, paid: null };
      })
      // 停用而且當月冇返工嘅員工唔顯示
      .filter((r) => r.hours > 0 || r.shifts > 0 || r.paid || r.active);

    const sum = (k: "hours" | "gross") => Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;
    return {
      month: input.month,
      rows,
      totals: {
        hours: sum("hours"),
        gross: sum("gross"),
        paidGross: Math.round(rows.reduce((a, r) => a + (r.paid ? r.gross : 0), 0) * 100) / 100,
        unpaidCount: rows.filter((r) => !r.paid && r.gross > 0).length,
      },
    };
  }),

  /** 出糧：按當時考勤 + 更表計算並凍結，該月記錄之後唔可以改 */
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
      const [att] = await attendanceOf(input.month, emp.id);
      const c = computeMonthPay(mine, att ?? null, input.adjustment);
      if (c.hours === 0 && input.adjustment === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${emp.name} ${input.month} 冇返工記錄` });
      }
      if (c.gross < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "扣減後人工唔可以少過 0" });
      await getDb().insert(payrollPayments).values({
        employeeId: emp.id,
        month: input.month,
        hours: c.hours.toFixed(2),
        basePay: c.base.toFixed(2),
        adjustment: c.adjustment.toFixed(2),
        grossPay: c.gross.toFixed(2),
        mpfEmployee: "0",
        mpfEmployer: "0",
        netPay: c.gross.toFixed(2),
        paidAt: input.paidAt,
        note: input.note,
      });
      return c;
    }),

  /** 取消出糧：解鎖該月考勤同更表（例如發現輸入錯咗） */
  unmarkPaid: adminQuery
    .input(z.object({ employeeId: z.number(), month: monthStr }))
    .mutation(async ({ input }) => {
      await getDb()
        .delete(payrollPayments)
        .where(and(eq(payrollPayments.employeeId, input.employeeId), eq(payrollPayments.month, input.month)));
      return { ok: true };
    }),
});

import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { DB_ERROR_RE, ensureDb, rootCause } from "./bootstrap";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // zod 輸入錯誤：抽出友善中文訊息，唔好彈 raw JSON
    let message = shape.message;
    const cause = error.cause as { issues?: { message: string; path: (string | number)[] }[] } | undefined;
    if (error.code === "BAD_REQUEST" && cause?.issues?.length) {
      message = cause.issues.map((i) => i.message).join("；");
    }
    // Postgres 外鍵錯誤（例如刪除有歷史記錄嘅租戶）→ 中文提示；其他 raw SQL 錯誤唔好直接彈畀用戶
    const raw = rootCause(error);
    if (/23503|foreign key/i.test(raw)) {
      message = "呢項資料仍有相關記錄（租約／銷售／租金），唔可以刪除";
    } else if (error.code === "INTERNAL_SERVER_ERROR" && /Failed query/i.test(message)) {
      console.error("[trpc]", raw);
      message = "伺服器處理失敗，請稍後再試";
    }
    return { ...shape, message };
  },
});

export const createRouter = t.router;

/** DB 錯誤時觸發背景自我修復（建表 + 種子資料） */
const dbWatchdog = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok) {
    if (DB_ERROR_RE.test(rootCause(result.error))) {
      void ensureDb();
    }
  }
  return result;
});

export const publicQuery = t.procedure.use(dbWatchdog);

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** 店主（admin）或店員（staff）都可以用 */
function requireStaffOrAdmin() {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "staff")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "此功能只限店主或店員使用",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(dbWatchdog).use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
/** 店員＋店主：上載銷售、改自己記錄、睇報表 */
export const staffQuery = authedQuery.use(requireStaffOrAdmin());

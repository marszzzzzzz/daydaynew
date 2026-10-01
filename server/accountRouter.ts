import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users, tenants } from "@db/schema";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { setSessionCookie } from "./lib/cookies";
import { signSessionToken } from "./auth/session";
import { withDbRetry } from "./bootstrap";
import { hashPassword, verifyPassword } from "./password";
import { DEMO_OWNER, DEMO_TENANT, DEMO_TENANT_LINK_NAME, ensureDemoAccounts, findRealOwner } from "../db/seed-lib";
import { env } from "./lib/env";

/** 登入失敗限制：同一 IP + 用戶名 15 分鐘內錯 8 次就暫時鎖住 */
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
function assertNotLocked(key: string) {
  const f = failures.get(key);
  if (f && Date.now() - f.first < FAIL_WINDOW_MS && f.count >= FAIL_LIMIT) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "登入失敗次數太多，請 15 分鐘後再試" });
  }
}
function recordFailure(key: string) {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || now - f.first >= FAIL_WINDOW_MS) failures.set(key, { count: 1, first: now });
  else f.count++;
  if (failures.size > 10000) failures.clear();
}

const usernameSchema = z
  .string()
  .min(3, "用戶名最少 3 個字符")
  .max(32, "用戶名最長 32 個字符")
  .regex(/^[\p{L}\p{N}_.-]+$/u, "用戶名只可以用中英文、數字、_ . -");
const passwordSchema = z.string().min(6, "密碼最少 6 個字符").max(72, "密碼最長 72 個字符");

function toUnionId(username: string) {
  return `local:${username.toLowerCase()}`;
}

export const accountRouter = createRouter({
  /** 公開設定：登入頁用嚟決定顯唔顯示 Demo 按鈕 */
  config: publicQuery.query(async () => {
    const hasOwner = await withDbRetry(async () => Boolean(await findRealOwner(getDb()))).catch(() => true);
    return { demoMode: env.demoMode, hasOwner };
  }),

  /** 自助註冊：一律係租客（唯讀）。店主戶口只可以由 OWNER_USERNAME 環境變數或 npm run owner:create 建立 */
  register: publicQuery
    .input(
      z.object({
        username: usernameSchema,
        password: passwordSchema,
        name: z.string().min(1, "請輸入顯示名稱").max(50, "名稱最長 50 字"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const unionId = toUnionId(input.username);

      if (unionId.startsWith("local:demo-")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "用戶名唔可以用 demo- 開頭" });
      }

      await withDbRetry(async () => {
        const db = getDb();
        const existing = await db.select({ id: users.id }).from(users).where(eq(users.unionId, unionId)).limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "呢個用戶名已被註冊" });
        }
        const passwordHash = await hashPassword(input.password);
        await db
          .insert(users)
          .values({ unionId, name: input.name.trim(), passwordHash, role: "user", lastSignInAt: new Date() })
          .onConflictDoNothing({ target: users.unionId });
      });
      const role = "user" as const;

      const token = await signSessionToken({ unionId });
      setSessionCookie(ctx, token);

      return { ok: true, role };
    }),

  /** 用戶名 + 密碼登入 */
  login: publicQuery
    .input(z.object({ username: z.string().min(1, "請輸入用戶名"), password: z.string().min(1, "請輸入密碼") }))
    .mutation(async ({ ctx, input }) => {
      const unionId = toUnionId(input.username.trim());
      const failKey = `${clientIp(ctx.req)}|${unionId}`;
      assertNotLocked(failKey);
      if (!env.demoMode && unionId.startsWith("local:demo-")) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用戶名或密碼錯誤" });
      }

      const user = await withDbRetry(async () => {
        const db = getDb();
        const rows = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
        const u = rows[0];
        if (!u?.passwordHash || !(await verifyPassword(input.password, u.passwordHash))) {
          recordFailure(failKey);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用戶名或密碼錯誤" });
        }
        failures.delete(failKey);
        await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, u.id));
        return u;
      });

      const token = await signSessionToken({ unionId });
      setSessionCookie(ctx, token);

      return { ok: true, role: user.role };
    }),

  /** Demo 試用登入：只限 DEMO_MODE=true；正式環境一律拒絕 */
  demoLogin: publicQuery
    .input(z.object({ kind: z.enum(["owner", "tenant"]) }))
    .mutation(async ({ ctx, input }) => {
      if (!env.demoMode) {
        throw new TRPCError({ code: "FORBIDDEN", message: "示範模式已關閉" });
      }
      const acc = input.kind === "owner" ? DEMO_OWNER : DEMO_TENANT;
      const unionId = toUnionId(acc.username);

      const user = await withDbRetry(async () => {
        const db = getDb();
        await ensureDemoAccounts(db);
        const rows = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
        const u = rows[0];
        if (!u) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Demo 戶口建立失敗，請稍後再試" });
        }
        // 租戶 Demo：確保有連結嘅租戶檔案，冇就即場連
        if (input.kind === "tenant") {
          const [profile] = await db.select().from(tenants).where(eq(tenants.name, DEMO_TENANT_LINK_NAME)).limit(1);
          if (profile && profile.userId !== u.id) {
            await db.update(tenants).set({ userId: u.id }).where(eq(tenants.id, profile.id));
          }
        }
        await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, u.id));
        return u;
      });

      const token = await signSessionToken({ unionId });
      setSessionCookie(ctx, token);

      return { ok: true, role: user.role };
    }),

  /** 店主直接開店員／租客戶口（v2 三級角色：admin 店主 / staff 店員 / user 租客） */
  createAccount: adminQuery
    .input(
      z.object({
        username: usernameSchema,
        password: passwordSchema,
        name: z.string().min(1, "請輸入顯示名稱").max(50),
        role: z.enum(["staff", "user"], { message: "角色只可以係店員（staff）或租客（user）" }),
      }),
    )
    .mutation(async ({ input }) => {
      const unionId = toUnionId(input.username);
      if (unionId.startsWith("local:demo-")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "用戶名唔可以用 demo- 開頭" });
      }
      return withDbRetry(async () => {
        const db = getDb();
        const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.unionId, unionId)).limit(1);
        if (dup) {
          throw new TRPCError({ code: "CONFLICT", message: "呢個用戶名已被註冊" });
        }
        const passwordHash = await hashPassword(input.password);
        const [row] = await db
          .insert(users)
          .values({ unionId, name: input.name, passwordHash, role: input.role, lastSignInAt: new Date() })
          .returning({ id: users.id });
        return { ok: true as const, id: row.id, role: input.role };
      });
    }),

  /** 店主重設店員／租客密碼（冇 email，所以由店主代為重設） */
  resetPassword: adminQuery
    .input(z.object({ userId: z.number(), password: passwordSchema }))
    .mutation(async ({ input }) => {
      return withDbRetry(async () => {
        const db = getDb();
        const [u] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢個戶口" });
        if (u.role === "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "店主密碼請用 npm run owner:create 重設" });
        }
        await db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, u.id));
        return { ok: true as const };
      });
    }),

  /** 店主改變現有戶口角色（user ↔ staff；admin 唔准改，店主得一個） */
  setUserRole: adminQuery
    .input(z.object({ userId: z.number(), role: z.enum(["staff", "user"]) }))
    .mutation(async ({ input }) => {
      return withDbRetry(async () => {
        const db = getDb();
        const [u] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "搵唔到呢個戶口" });
        if (u.role === "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "店主戶口唔可以改角色" });
        }
        await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
        return { ok: true as const };
      });
    }),
});

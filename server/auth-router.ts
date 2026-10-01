import { clearSessionCookie } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import type { PublicUser } from "@db/schema";

export const authRouter = createRouter({
  /** 目前登入用戶（唔會回傳 passwordHash） */
  me: authedQuery.query(({ ctx }): PublicUser => {
    const { passwordHash: _omit, ...safe } = ctx.user;
    return safe;
  }),
  logout: publicQuery.mutation(({ ctx }) => {
    clearSessionCookie(ctx);
    return { success: true };
  }),
});

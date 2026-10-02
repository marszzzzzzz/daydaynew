import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { shopRouter } from "./shopRouter";
import { accountRouter } from "./accountRouter";
import { payrollRouter } from "./payrollRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  shop: shopRouter,
  payroll: payrollRouter,
});

export type AppRouter = typeof appRouter;

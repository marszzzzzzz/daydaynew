import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { shopRouter } from "./shopRouter";
import { accountRouter } from "./accountRouter";
import { payrollRouter } from "./payrollRouter";
import { bannerRouter } from "./bannerRouter";
import { productsRouter } from "./productsRouter";
import { facebookRouter } from "./facebookRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  shop: shopRouter,
  payroll: payrollRouter,
  banner: bannerRouter,
  products: productsRouter,
  facebook: facebookRouter,
});

export type AppRouter = typeof appRouter;

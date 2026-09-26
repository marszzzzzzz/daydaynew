import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./auth/session";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = (await authenticateRequest(opts.req.headers)) ?? undefined;
  } catch (e) {
    console.warn("[auth] session lookup failed:", (e as Error).message);
  }
  return ctx;
}

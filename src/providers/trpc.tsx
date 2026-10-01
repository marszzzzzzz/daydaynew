import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        let res: Response;
        try {
          res = await globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
        } catch {
          throw new Error("連唔到伺服器，請檢查網絡後再試");
        }
        // 伺服器超時／崩潰時 Vercel 會回純文字（唔係 JSON），轉做清楚嘅中文錯誤
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) {
          throw new Error(
            res.status === 504 || res.status === 502
              ? "伺服器回應超時，請等幾秒再試一次"
              : `伺服器暫時出錯（${res.status}），請稍後再試`,
          );
        }
        return res;
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

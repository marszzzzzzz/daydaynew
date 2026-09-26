import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { SectionTitle, ActionButton } from "../ui";

/**
 * 08 示範資料：生成器面板
 * - 初始化 70 格佈局（001–070，10 排 × 7，第 3、4 排大格）
 * - 生成 / 清除【示範】營業資料（租戶、租約、銷售、租金按金）
 * - 重置 demo 戶口密碼
 */
export default function DemoTab() {
  const utils = trpc.useUtils();
  const status = trpc.shop.admin.demoStatus.useQuery();

  const refresh = () => {
    void status.refetch();
    void utils.invalidate();
  };

  const initGrids = trpc.shop.admin.initGrids.useMutation({
    onSuccess: (r) => {
      toast.success(r.added > 0 ? `已補齊 ${r.added} 個格仔` : "70 格佈局已齊全，無需新增");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const generate = trpc.shop.admin.generateDemoData.useMutation({
    onSuccess: (r) => {
      toast.success(`已生成：${r.tenants} 租戶 · ${r.leases} 租約 · ${r.sales} 銷售 · ${r.rent} 租金記錄`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const clear = trpc.shop.admin.clearDemoData.useMutation({
    onSuccess: (r) => {
      toast.success(r.removed > 0 ? `已清除 ${r.removed} 個示範租戶及相關記錄` : "冇示範資料可清除");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetAcc = trpc.shop.admin.resetDemoAccounts.useMutation({
    onSuccess: () => toast.success("Demo 戶口密碼已重置為 demo1234"),
    onError: (e) => toast.error(e.message),
  });

  const s = status.data;
  const pending = initGrids.isPending || generate.isPending || clear.isPending || resetAcc.isPending;
  const demoMode = s?.demoMode ?? false;

  return (
    <div className="space-y-10">
      <SectionTitle
        no="08"
        title="示範資料生成器"
        desc="用嚟演示同試用：一撳生成成間舖嘅示範數據；清除時只會刪【示範】開頭嘅租戶同相關記錄，真實數據唔會受影響。"
      />

      <p
        className={`border px-4 py-3 text-[12.5px] leading-[1.85] ${demoMode ? "border-ochre-deep/50 bg-ochre/10 text-ink/75" : "border-ink/25 bg-ink/5 text-ink/70"}`}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep">
          {demoMode ? "示範模式：開啟 — " : "示範模式：關閉 — "}
        </span>
        {demoMode
          ? "登入頁會顯示 Demo 一撳登入。正式開舖前，請將伺服器環境變數 DEMO_MODE 設為 false 並重新啟動。"
          : "正式營運模式：Demo 登入已停用、demo 戶口已移除，亦唔可以生成示範資料。你仍然可以清除舊示範資料。"}
      </p>

      {/* 狀態總覽 */}
      <div className="grid gap-[3px] border border-ink/25 bg-ink/10 sm:grid-cols-3">
        <StatCell label="格仔總數" value={s ? `${s.grids} / ${s.expectedGrids}` : "…"} ok={s ? s.grids >= s.expectedGrids : false} />
        <StatCell label="示範租戶" value={s ? `${s.demoTenants} 個` : "…"} ok={s ? s.demoTenants > 0 : false} />
        <StatCell
          label="Demo 戶口"
          value={s ? (s.demoAccounts.length ? s.demoAccounts.join(" · ") : "未建立") : "…"}
          ok={s ? s.demoAccounts.length >= 2 : false}
        />
      </div>

      {/* 操作 */}
      <div className="space-y-6 border border-ink/25 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-medium">第一步 · 格仔佈局</p>
            <p className="mt-1 text-[13px] leading-[1.8] text-ink/60">
              建立標準 70 格：編號 001–070，10 排 × 每排 7 格；第 3、4 排（015–028）係大格 $700，其餘中格 $500。已存在嘅編號會跳過。
            </p>
          </div>
          <ActionButton onClick={() => initGrids.mutate()} disabled={pending}>
            {initGrids.isPending ? "處理中…" : "初始化 / 補齊 70 格"}
          </ActionButton>
        </div>

        <hr className="dotline" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-medium">第二步 · 示範營業資料</p>
            <p className="mt-1 text-[13px] leading-[1.8] text-ink/60">
              生成 4 個【示範】租戶、4 份租約（中格大格都有）、近 40 日銷售記錄、租金按金記錄。
            </p>
          </div>
          <div className="flex gap-3">
            <ActionButton onClick={() => generate.mutate()} disabled={pending || !demoMode}>
              {generate.isPending ? "生成中…" : "生成示範資料"}
            </ActionButton>
            <ActionButton
              tone="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm("確定清除所有【示範】租戶及相關租約、銷售、租金記錄？真實數據不受影響。")) {
                  clear.mutate();
                }
              }}
            >
              {clear.isPending ? "清除中…" : "清除示範資料"}
            </ActionButton>
          </div>
        </div>

        <hr className="dotline" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-medium">Demo 戶口</p>
            <p className="mt-1 text-[13px] leading-[1.8] text-ink/60">
              只喺示範模式下存在：登入頁「店主 Demo / 租戶 Demo」一撳即用。關閉示範模式後會自動刪除。
            </p>
          </div>
          <ActionButton tone="ghost" onClick={() => resetAcc.mutate()} disabled={pending || !demoMode}>
            {resetAcc.isPending ? "重置中…" : "重置 demo 密碼"}
          </ActionButton>
        </div>
      </div>

    </div>
  );
}

function StatCell({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-cream px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 font-mono text-[15px] font-semibold">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-ink" : "bg-ochre-deep"}`} />
        {value}
      </p>
    </div>
  );
}

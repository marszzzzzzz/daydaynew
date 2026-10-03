import { useState } from "react";
import { askConfirm, askPrompt } from "@/components/AppDialog";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { SectionTitle, Field, ActionButton, EmptyRow, statusBadge, statusLabel } from "../ui";

export default function GridsTab() {
  const utils = trpc.useUtils();
  const grids = trpc.shop.admin.listGrids.useQuery();

  const [code, setCode] = useState("");
  const [size, setSize] = useState<"M" | "L">("M");
  const [rent, setRent] = useState("");

  const invalidate = () => {
    utils.shop.admin.listGrids.invalidate();
    utils.shop.admin.stats.invalidate();
    utils.shop.publicStats.invalidate();
    utils.shop.publicGridWall.invalidate();
  };

  const create = trpc.shop.admin.createGrid.useMutation({
    onSuccess: () => {
      toast.success(`格仔 ${code.toUpperCase()} 已新增`);
      setCode("");
      setRent("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.shop.admin.updateGrid.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.shop.admin.deleteGrid.useMutation({
    onSuccess: () => {
      toast.success("已刪除");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = grids.data ?? [];

  return (
    <div>
      <SectionTitle
        no="02 · Grids"
        title="格仔管理"
        desc="新增格仔、調整月租、更改狀態。有生效租約嘅格仔唔可以刪除。"
      />

      {/* 新增格仔 */}
      <form
        className="grid gap-5 border border-ink/25 p-6 md:grid-cols-[1fr_140px_160px_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const rentNum = Number(rent);
          if (!code.trim()) return toast.error("請輸入格仔編號");
          if (!Number.isFinite(rentNum) || rentNum < 0) return toast.error("請輸入正確月租");
          create.mutate({ code: code.trim(), size, monthlyRent: rentNum });
        }}
      >
        <Field label="格仔編號（001–070）">
          <input className="underline-input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="024" />
        </Field>
        <Field label="尺寸">
          <select className="underline-input w-full bg-transparent" value={size} onChange={(e) => setSize(e.target.value as "M" | "L")}>
            <option value="M">M · 中格（$500）</option>
            <option value="L">L · 大格（$700）</option>
          </select>
        </Field>
        <Field label="月租 HKD">
          <input className="underline-input font-mono" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="500" inputMode="decimal" />
        </Field>
        <ActionButton disabled={create.isPending}>{create.isPending ? "新增中…" : "+ 新增格仔"}</ActionButton>
      </form>

      {/* 格仔列表 */}
      <div className="mt-10 overflow-x-auto">
        <table className="ledger-table w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4">編號</th>
              <th className="py-3 pr-4">尺寸</th>
              <th className="py-3 pr-4 text-right">月租</th>
              <th className="py-3 pr-4">狀態</th>
              <th className="py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="transition-colors hover:bg-ochre/10">
                <td className="py-3 pr-4 font-mono font-semibold">{g.code}</td>
                <td className="py-3 pr-4 font-mono">{g.size}</td>
                <td className="py-3 pr-4 text-right font-mono">${fmtMoney(g.monthlyRent)}</td>
                <td className="py-3 pr-4">
                  <span className={`badge-frame border ${statusBadge[g.status]}`}>{statusLabel[g.status]}</span>
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <select
                      className="border border-ink/30 bg-transparent px-2 py-1 font-mono text-[11.5px]"
                      value={g.status}
                      onChange={(e) => update.mutate({ id: g.id, status: e.target.value as "vacant" | "occupied" | "reserved" })}
                    >
                      <option value="vacant">招租中</option>
                      <option value="occupied">已租出</option>
                      <option value="reserved">已預留</option>
                    </select>
                    <button
                      onClick={async () => {
                        const v = await askPrompt(`格仔 ${g.code} 新月租（HKD）`, String(Number(g.monthlyRent)));
                        if (v === null) return;
                        const n = Number(v);
                        if (!Number.isFinite(n) || n < 0) return toast.error("租金格式錯誤");
                        update.mutate({ id: g.id, monthlyRent: n });
                      }}
                      className="px-2 py-1 font-mono text-[11.5px] text-ink/60 underline-offset-2 hover:underline"
                    >
                      改租
                    </button>
                    <button
                      onClick={async () => {
                        if (await askConfirm(`確定刪除格仔 ${g.code}？`, { danger: true, confirmLabel: "刪除" })) del.mutate({ id: g.id });
                      }}
                      className="px-2 py-1 font-mono text-[11.5px] text-red-800/80 underline-offset-2 hover:underline"
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow colSpan={5} text={grids.isLoading ? "載入中…" : "未有格仔，請先新增"} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

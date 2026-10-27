import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { ActionButton, Field } from "../../ui";

type Settings = { enabled: boolean; bestDays: number; bestCount: number };

/** 首頁輪播開關 + 熱銷計算方法 */
export default function ShowcaseSettings() {
  const saved = trpc.products.settings.useQuery();
  return saved.data ? <SettingsForm initial={saved.data} /> : null;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const utils = trpc.useUtils();
  const [s, setS] = useState(initial);
  const dirty = s.enabled !== initial.enabled || s.bestDays !== initial.bestDays || s.bestCount !== initial.bestCount;
  const save = trpc.products.saveSettings.useMutation({
    onSuccess: () => {
      toast.success(s.enabled ? "已儲存，首頁會顯示商品輪播" : "已儲存，首頁暫時唔顯示商品輪播");
      void utils.products.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const num = (v: string) => (v === "" ? 0 : Math.trunc(Number(v)));

  return (
    <div className="mb-10 grid gap-5 border-2 border-ink p-5 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block font-semibold">首頁顯示商品輪播</span>
          <span className="text-[12.5px] text-ink/55">上行精選（你揀）、下行熱銷（按銷量自動排）</span>
        </span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#1D1D1D]" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
      </label>
      <Field label="熱銷計最近（日）">
        <input className="underline-input font-mono" inputMode="numeric" value={s.bestDays || ""} onChange={(e) => setS({ ...s, bestDays: num(e.target.value) })} />
      </Field>
      <Field label="熱銷顯示（件）">
        <input className="underline-input font-mono" inputMode="numeric" value={s.bestCount || ""} onChange={(e) => setS({ ...s, bestCount: num(e.target.value) })} />
      </Field>
      <ActionButton tone="ochre" disabled={!dirty || save.isPending} onClick={() => save.mutate(s)}>
        {save.isPending ? "儲存中…" : "儲存設定"}
      </ActionButton>
    </div>
  );
}

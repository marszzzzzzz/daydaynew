import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { whatsappLink } from "@/const";
import BannerCard from "@/components/banner/BannerCard";
import { BANNER_BODY_MAX, BANNER_LABEL_MAX, BANNER_TITLE_MAX, bannerInputSchema, hkToday, isBannerLive, type BannerContent } from "@contracts/banner";
import { SectionTitle, Field, ActionButton } from "../ui";

const LINK_PRESETS = [
  { label: "WhatsApp 查詢", url: whatsappLink(), text: "WhatsApp 查詢" },
  { label: "登入頁", url: "/login", text: "立即登入" },
];

function statusOf(b: BannerContent, today: string) {
  if (!b.enabled) return { text: "已關閉", cls: "border-ink/30 text-ink/50" };
  if (b.startDate && today < b.startDate) return { text: `${b.startDate} 開始顯示`, cls: "border-ochre-deep text-ochre-deep" };
  if (b.endDate && today > b.endDate) return { text: "已過期", cls: "border-red-800/60 text-red-800" };
  return { text: "網站顯示中", cls: "border-ink bg-ink text-cream" };
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`font-mono text-[10.5px] ${value.length > max ? "text-red-800" : "text-ink/40"}`}>{value.length}/{max}</span>;
}

/** 13 最新宣傳：編輯首頁浮動橫幅，右邊即時預覽 */
export default function BannerTab() {
  const saved = trpc.banner.get.useQuery();
  return saved.data ? <BannerForm initial={saved.data} updatedAt={saved.data.updatedAt} /> : <p className="font-mono text-[12px] text-ink/50">載入中…</p>;
}

function BannerForm({ initial, updatedAt }: { initial: BannerContent; updatedAt: Date | string | null }) {
  const utils = trpc.useUtils();
  const [b, setB] = useState<BannerContent>({
    enabled: initial.enabled,
    title: initial.title,
    body: initial.body,
    linkUrl: initial.linkUrl,
    linkLabel: initial.linkLabel,
    startDate: initial.startDate,
    endDate: initial.endDate,
  });
  const set = <K extends keyof BannerContent>(k: K, v: BannerContent[K]) => setB((prev) => ({ ...prev, [k]: v }));

  const save = trpc.banner.save.useMutation({
    onSuccess: (r) => {
      toast.success(r.live ? "已儲存，網站而家顯示緊呢個橫幅" : "已儲存（網站暫時唔會顯示）");
      void utils.banner.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const parsed = bannerInputSchema.safeParse(b);
  const firstError = parsed.success ? null : parsed.error.issues[0].message;
  const today = hkToday();
  const status = statusOf(b, today);
  const input = "underline-input";

  return (
    <div>
      <SectionTitle
        no="13 · Promotion"
        title="最新宣傳"
        desc="首頁底部會浮出一個宣傳橫幅，訪客可以撳 × 閂咗。你每次儲存新內容，之前閂咗嘅訪客都會再見到。"
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr]">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (firstError) return toast.error(firstError);
            save.mutate(b);
          }}
        >
          <label className="flex cursor-pointer items-center justify-between gap-4 border-2 border-ink p-4">
            <span>
              <span className="block font-semibold">喺網站顯示</span>
              <span className="text-[12.5px] text-ink/55">關閉之後內容會保留，下次再開就得</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-[#1D1D1D]" checked={b.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          </label>

          <Field label="標題">
            <input className={input} value={b.title} onChange={(e) => set("title", e.target.value)} placeholder="例如：十一月新租戶首月免租" />
            <Counter value={b.title} max={BANNER_TITLE_MAX} />
          </Field>
          <Field label="內容（可留空）">
            <textarea
              className={`${input} min-h-[72px] resize-y`}
              value={b.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="例如：11 月 30 日前簽約，首月免租 7 日，名額有限"
            />
            <Counter value={b.body} max={BANNER_BODY_MAX} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-[1.6fr_1fr]">
            <Field label="按鈕連結（可留空）">
              <input className={`${input} font-mono text-[13px]`} value={b.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://… 或 /login" />
            </Field>
            <Field label="按鈕文字">
              <input className={input} value={b.linkLabel} onChange={(e) => set("linkLabel", e.target.value)} placeholder="立即查詢" />
              <Counter value={b.linkLabel} max={BANNER_LABEL_MAX} />
            </Field>
          </div>
          <div className="-mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink/55">
            快速填入：
            {LINK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setB((prev) => ({ ...prev, linkUrl: p.url, linkLabel: prev.linkLabel || p.text }))}
                className="border border-ink/30 px-2.5 py-1 font-mono text-[11px] transition-colors hover:bg-ink hover:text-cream"
              >
                {p.label}
              </button>
            ))}
            {b.linkUrl && (
              <button type="button" onClick={() => setB((prev) => ({ ...prev, linkUrl: "", linkLabel: "" }))} className="px-1 underline-offset-2 hover:underline">
                清除連結
              </button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="開始日期（可留空）">
              <input type="date" className={`${input} font-mono`} value={b.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="結束日期（可留空，包當日）">
              <input type="date" className={`${input} font-mono`} value={b.endDate} min={b.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-ink/15 pt-5">
            <ActionButton tone="ochre" disabled={save.isPending || !!firstError}>
              {save.isPending ? "儲存中…" : "儲存"}
            </ActionButton>
            {firstError ? (
              <span className="text-[12.5px] text-red-800">{firstError}</span>
            ) : (
              updatedAt && <span className="font-mono text-[11px] text-ink/45">上次儲存：{new Date(updatedAt).toLocaleString("zh-HK", { hour12: false })}</span>
            )}
          </div>
        </form>

        {/* 即時預覽 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="spec-label">即時預覽</p>
            <span className={`badge-frame border font-mono text-[11px] ${status.cls}`}>{isBannerLive(b, today) ? "● " : ""}{status.text}</span>
          </div>
          <div className="relative overflow-hidden border border-ink/25 bg-cream-2 px-4 pb-4 pt-24" aria-label="首頁預覽">
            <div className="absolute inset-x-4 top-4 space-y-2" aria-hidden="true">
              <div className="h-3 w-1/3 bg-ink/10" />
              <div className="h-6 w-2/3 bg-ink/15" />
              <div className="h-3 w-1/2 bg-ink/10" />
            </div>
            <div className={b.enabled ? "" : "opacity-40 grayscale"}>
              <BannerCard banner={b} onClose={() => toast("訪客撳 × 就會閂咗；你改內容後佢哋會再見到")} />
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-[1.8] text-ink/50">
            實際位置：首頁右下角（手機係畫面底部、闊到成個畫面），打開頁面約 1 秒後滑入。
          </p>
        </div>
      </div>
    </div>
  );
}

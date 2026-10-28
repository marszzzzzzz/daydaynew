import { useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/router";
import { trpc } from "@/providers/trpc";
import { ActionButton, SectionTitle } from "../../ui";
import SetupGuide from "./SetupGuide";
import PostCard from "./PostCard";

export type FbPostRow = inferRouterOutputs<AppRouter>["facebook"]["list"][number];
type Filter = "new" | "done" | "ignored" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "new", label: "待處理" },
  { id: "done", label: "已處理" },
  { id: "ignored", label: "略過" },
  { id: "all", label: "全部" },
];

const EMPTY: Record<Filter, string> = {
  new: "冇待處理嘅帖文。撳「立即同步」讀最新帖文。",
  done: "未有處理過嘅帖文",
  ignored: "未有略過嘅帖文",
  all: "未有帖文。撳「立即同步」讀最新帖文。",
};

function StatusLine({ label, on, onText, offText }: { label: string; on: boolean; onText: string; offText: string }) {
  return (
    <p className="text-[12.5px]">
      <span className={on ? "text-ink" : "text-ochre-deep"}>{on ? "●" : "○"}</span> {label}：<span className="text-ink/65">{on ? onText : offText}</span>
    </p>
  );
}

/** 15 Facebook 消息：同步專頁帖文 → 整理 → 店主確認先更新商品／橫幅 */
export default function FacebookTab() {
  const [filter, setFilter] = useState<Filter>("new");
  const utils = trpc.useUtils();
  const status = trpc.facebook.status.useQuery();
  const list = trpc.facebook.list.useQuery({ status: filter }, { enabled: !!status.data?.configured || (status.data?.counts.new ?? 0) > 0 });
  const sync = trpc.facebook.sync.useMutation({
    onSuccess: (r) => {
      toast.success(r.newPosts ? `讀到 ${r.newPosts} 篇新帖` : "冇新帖文");
      void utils.facebook.invalidate();
    },
    onError: (e) => {
      toast.error(e.message);
      void utils.facebook.status.invalidate();
    },
  });

  const s = status.data;
  if (!s) return <p className="font-mono text-[12px] text-ink/50">載入中…</p>;
  const counts: Record<Filter, number> = { ...s.counts, all: s.counts.new + s.counts.done + s.counts.ignored };

  return (
    <div>
      <SectionTitle
        no="15 · Facebook"
        title="Facebook 消息"
        desc="自動讀你格仔店專頁嘅新帖文，整理出類型、格仔編號、貨品同價錢、活動日期。你確認之後，先會更新商品資料或者首頁宣傳橫幅。"
      />

      {!s.configured ? (
        <SetupGuide />
      ) : (
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5 border-2 border-ink p-5">
          <div className="space-y-1">
            <StatusLine label="專頁" on onText="已連接" offText="" />
            <StatusLine label="AI 整理" on={s.aiEnabled} onText="開咗（Claude）" offText="未開，用規則整理（加 ANTHROPIC_API_KEY 就會開）" />
            <StatusLine label="每日自動同步" on={s.cronEnabled} onText="每日香港時間 09:00" offText="未開（加 CRON_SECRET 就會開）" />
            <p className={`pt-1 font-mono text-[11.5px] ${s.lastOk ? "text-ink/50" : "text-red-800"}`}>
              {s.lastSyncAt ? `上次同步 ${new Date(s.lastSyncAt).toLocaleString("zh-HK", { hour12: false })}：${s.lastMessage}` : "未同步過"}
            </p>
          </div>
          <ActionButton tone="ochre" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? "同步中…" : "立即同步"}
          </ActionButton>
        </div>
      )}

      {(s.configured || counts.all > 0) && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label="篩選帖文">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`border px-3 py-1.5 font-mono text-[11.5px] transition-colors ${filter === f.id ? "border-ink bg-ink text-cream" : "border-ink/30 hover:border-ink"}`}
              >
                {f.label} {counts[f.id]}
              </button>
            ))}
          </div>
          <ul className="border-b border-ink/15">
            {list.data?.map((p) => <PostCard key={p.id} post={p} />)}
            {list.data?.length === 0 && <li className="py-14 text-center text-ink/45">{EMPTY[filter]}</li>}
          </ul>
        </>
      )}
    </div>
  );
}

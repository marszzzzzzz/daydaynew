import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { FB_TYPE_LABEL, type FbPostType } from "@contracts/facebook";
import { ApplyBannerForm, ApplyProductForm } from "./ApplyForms";
import type { FbPostRow } from "./FacebookTab";

type Panel = "product" | "banner" | null;

const fmtDate = (d: Date | string) => new Date(d).toLocaleString("zh-HK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function Chip({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "ochre" }) {
  return <span className={`border px-2 py-0.5 font-mono text-[11px] ${tone === "ochre" ? "border-ochre-deep/60 bg-ochre/10 text-ochre-deep" : "border-ink/25 text-ink/70"}`}>{children}</span>;
}

function SmallButton({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-40 ${primary ? "bg-ink text-cream hover:bg-ink/85" : "border border-ink/35 hover:bg-ink hover:text-cream"}`}
    >
      {children}
    </button>
  );
}

/** 一篇帖文：摘要、抽出嘅資料、確認動作（店主撳先會改正式資料） */
export default function PostCard({ post }: { post: FbPostRow }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();
  const refresh = () => void utils.facebook.invalidate();
  const setStatus = trpc.facebook.setStatus.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const reanalyze = trpc.facebook.reanalyze.useMutation({
    onSuccess: (r) => {
      toast.success(r.analyzedBy === "ai" ? "已用 AI 重新整理" : "已用規則重新整理");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const { insight } = post;
  const type = insight.type as FbPostType;
  const busy = setStatus.isPending || reanalyze.isPending;
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <li className="border-t border-ink/15 py-5">
      <div className="flex gap-4">
        {post.imageUrl && (
          <img src={post.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-20 w-20 shrink-0 border border-ink/20 object-cover sm:h-24 sm:w-24" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-ink px-2 py-0.5 font-mono text-[11px] text-cream">{FB_TYPE_LABEL[type] ?? "其他"}</span>
            <span className="font-mono text-[11px] text-ink/50">{fmtDate(post.createdTime)}</span>
            <span className="font-mono text-[10.5px] text-ink/45">
              {post.analyzedBy === "ai" ? "AI 整理" : post.aiPending ? "規則整理 · AI 稍後再試" : "規則整理"}
            </span>
            {post.permalink && (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-ochre-deep underline-offset-2 hover:underline">
                喺 Facebook 睇 ↗
              </a>
            )}
          </div>
          <p className="mt-2 font-semibold leading-snug">{insight.summary}</p>
          {post.message && (
            <button type="button" onClick={() => setExpanded(!expanded)} className={`mt-1 block whitespace-pre-line text-left text-[12.5px] leading-[1.75] text-ink/60 ${expanded ? "" : "line-clamp-2"}`}>
              {post.message}
            </button>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {insight.gridCodes.map((c) => (
              <Chip key={c} tone="ochre">
                格仔 {c}
              </Chip>
            ))}
            {insight.products.map((p) => (
              <Chip key={p.name}>
                {p.name}
                {p.price !== null && ` · $${p.price}`}
              </Chip>
            ))}
            {(insight.eventStart || insight.eventEnd) && (
              <Chip>
                {insight.eventStart || "?"} → {insight.eventEnd || "?"}
              </Chip>
            )}
          </div>
          {insight.followUps.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink/70">
              {insight.followUps.map((f) => (
                <li key={f}>□ {f}</li>
              ))}
            </ul>
          )}

          {post.status === "new" ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              <SmallButton primary={type === "product"} onClick={() => toggle("product")} disabled={busy}>
                {panel === "product" ? "收起" : "轉做商品"}
              </SmallButton>
              <SmallButton primary={type === "event"} onClick={() => toggle("banner")} disabled={busy}>
                {panel === "banner" ? "收起" : "轉做宣傳橫幅"}
              </SmallButton>
              <SmallButton onClick={() => setStatus.mutate({ id: post.id, status: "done" })} disabled={busy}>
                標記已處理
              </SmallButton>
              <SmallButton onClick={() => setStatus.mutate({ id: post.id, status: "ignored" })} disabled={busy}>
                略過
              </SmallButton>
              <SmallButton onClick={() => reanalyze.mutate({ id: post.id })} disabled={busy}>
                {reanalyze.isPending ? "整理中…" : "重新整理"}
              </SmallButton>
            </div>
          ) : (
            <p className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11.5px] text-ink/55">
              ✓ {post.action || (post.status === "ignored" ? "略過" : "已處理")}
              <button type="button" onClick={() => setStatus.mutate({ id: post.id, status: "new" })} disabled={busy} className="underline-offset-2 hover:underline">
                放返待處理
              </button>
            </p>
          )}
        </div>
      </div>

      {panel && (
        <div className="mt-4 border-2 border-ink bg-cream p-4 sm:ml-28 sm:p-5" style={{ boxShadow: "5px 5px 0 0 rgba(179,156,79,1)" }}>
          {panel === "product" ? <ApplyProductForm post={post} onDone={() => setPanel(null)} /> : <ApplyBannerForm post={post} onDone={() => setPanel(null)} />}
        </div>
      )}
    </li>
  );
}

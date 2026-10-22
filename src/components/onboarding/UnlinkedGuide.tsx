import { toast } from "sonner";
import AnimatedCheck from "./AnimatedCheck";

/** 已登入但未連結租戶檔案：用三步時間線講清楚「下一步要做乜」 */
export default function UnlinkedGuide({ username, displayName }: { username: string; displayName: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(username);
      toast.success("已複製用戶名，可以貼去 WhatsApp 俾店主");
    } catch {
      toast.error("複製唔到，請手動抄低用戶名");
    }
  };

  const steps = [
    { state: "done" as const, title: "開咗戶口", body: `你已經用「${displayName}」登入。` },
    {
      state: "now" as const,
      title: "話俾店主知你嘅用戶名",
      body: "店主要喺後台將你嘅戶口連結去你租嘅格仔。WhatsApp 或者到店講一聲就得。",
    },
    { state: "todo" as const, title: "睇到自己格仔嘅銷售", body: "店主連結好之後，呢頁會自動更新，再帶你完成設定。" },
  ];

  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <p className="ob-rise spec-label">Almost there — 差一步</p>
      <h1 className="ob-rise font-display mt-2 text-3xl font-black tracking-tight sm:text-4xl" style={{ animationDelay: "80ms" }}>
        等店主幫你連結格仔
      </h1>
      <ol className="relative mt-10 space-y-8">
        <span className="absolute bottom-3 left-[15px] top-3 w-px bg-ink/20" aria-hidden="true" />
        {steps.map((s, i) => (
          <li key={s.title} className="ob-rise relative flex gap-5" style={{ animationDelay: `${180 + i * 140}ms` }}>
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-[12px] ${
                s.state === "done" ? "border-ink bg-ink text-cream" : s.state === "now" ? "ob-cell-mine border-ink bg-ochre text-ink" : "border-ink/30 bg-cream text-ink/45"
              }`}
            >
              {s.state === "done" ? <AnimatedCheck size={15} /> : i + 1}
            </span>
            <div className={s.state === "todo" ? "text-ink/50" : ""}>
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-[13.5px] leading-[1.85] text-ink/65">{s.body}</p>
              {s.state === "now" && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-ink bg-cream-2 px-4 py-3">
                  <span className="w-full text-[12px] text-ink/60 sm:w-auto">你嘅用戶名</span>
                  <code className="min-w-0 flex-1 break-all font-mono text-[16px] font-bold">{username}</code>
                  <button onClick={copy} className="whitespace-nowrap border border-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-cream">
                    複製
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-10 flex items-center gap-2 font-mono text-[11px] text-ink/45">
        <span className="ob-ring inline-block h-2 w-2 rounded-full bg-ochre" aria-hidden="true" />
        每 20 秒自動檢查一次連結狀態
      </p>
    </main>
  );
}

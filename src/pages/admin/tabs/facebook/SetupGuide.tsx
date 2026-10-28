/** 未設定 FB_PAGE_ID / FB_PAGE_TOKEN 時顯示：一步步教店主攞長期專頁權杖 */
const STEPS: { title: string; body: string }[] = [
  {
    title: "開一個 Meta App",
    body: "用管理專頁嘅 Facebook 帳號登入 developers.facebook.com → 我的應用程式 → 建立應用程式，用途揀「管理專頁上的所有內容」。App 保持「開發」模式就得，自己專頁唔使送審。",
  },
  {
    title: "攞專頁權杖",
    body: "工具 → Graph API Explorer：揀返你個 App，權限加 pages_show_list 同 pages_read_engagement，撳 Generate Access Token 並揀你嘅格仔店專頁。",
  },
  {
    title: "轉做長期權杖",
    body: "工具 → Access Token Debugger：貼入啱啱個權杖 → Extend Access Token。再喺 Graph API Explorer 用長期權杖查 me/accounts，你專頁嗰行嘅 access_token（專頁權杖，唔會過期）同 id 就係要用嘅兩樣嘢。",
  },
  {
    title: "放入 Vercel（唔好貼喺任何對話或者訊息）",
    body: "Vercel → 專案 → Settings → Environment Variables，加 FB_PAGE_ID、FB_PAGE_TOKEN，同埋 CRON_SECRET（任意一串長密碼，用嚟每日自動同步）。想用 AI 整理就再加 ANTHROPIC_API_KEY。加完要重新部署一次先生效。",
  },
];

export default function SetupGuide() {
  return (
    <div className="border-2 border-ink p-5 sm:p-6">
      <p className="spec-label">未連接</p>
      <h3 className="font-display mt-1 text-xl font-black tracking-tight">連接你嘅 Facebook 專頁（大約 15 分鐘）</h3>
      <p className="mt-2 max-w-2xl text-[13px] leading-[1.85] text-ink/65">
        只會讀你自己管理嘅專頁帖文，唔會發帖、唔會讀私訊。權杖由你自己放入 Vercel，系統唔會顯示、亦唔會記錄喺資料庫。
      </p>
      <ol className="mt-5 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[32px_1fr] gap-3">
            <span className="font-display text-2xl font-black leading-none text-ochre-deep">{i + 1}</span>
            <div>
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-[13px] leading-[1.85] text-ink/70">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

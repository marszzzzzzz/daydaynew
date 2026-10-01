import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import Noise from "@/components/Noise";

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // 登入
  const [lUser, setLUser] = useState("");
  const [lPass, setLPass] = useState("");

  // 註冊
  const [rUser, setRUser] = useState("");
  const [rName, setRName] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPass2, setRPass2] = useState("");

  const onAuthed = async (role: string) => {
    await utils.invalidate();
    toast.success(role === "admin" ? "歡迎，店主！" : "登入成功！");
    navigate("/dashboard");
  };

  const login = trpc.account.login.useMutation({
    onSuccess: (r) => void onAuthed(r.role),
    onError: (e) => toast.error(e.message),
  });

  const register = trpc.account.register.useMutation({
    onSuccess: (r) => void onAuthed(r.role),
    onError: (e) => toast.error(e.message),
  });

  const demo = trpc.account.demoLogin.useMutation({
    onSuccess: (r) => void onAuthed(r.role),
    onError: (e) => toast.error(e.message),
  });

  const { data: config } = trpc.account.config.useQuery(undefined, {
    staleTime: 60_000,
  });
  const pending = login.isPending || register.isPending || demo.isPending;

  return (
    <div className="grid min-h-screen bg-cream text-ink md:grid-cols-2">
      <Noise />

      {/* 左：品牌版（黑） */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-cream md:flex md:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(248,247,229,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(248,247,229,0.7) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <Link to="/" className="relative flex items-baseline gap-2">
          <span className="whitespace-nowrap font-display text-2xl font-black tracking-tight">
            日日新格仔鋪
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-cream/50">
            GridBox.hk
          </span>
        </Link>
        <div className="relative">
          <p className="font-mono mb-6 text-[11px] uppercase tracking-[0.22em] text-cream/50">
            {mode === "login" ? "Sign in — 登入" : "Register — 註冊"}
          </p>
          <h1 className="font-display text-balance text-5xl font-black leading-[1.12] tracking-tight md:text-6xl">
            {mode === "login" ? (
              <>
                歡迎返嚟，
                <br />
                老細。
              </>
            ) : (
              <>
                開個戶口，
                <br />
                即刻開檔。
              </>
            )}
          </h1>
          <p className="mt-6 max-w-sm text-[14px] leading-[1.9] text-cream/65">
            租戶登入睇自己嘅銷售記錄；店主登入管理格仔、租約、租金同每日銷售。
          </p>
        </div>
        <p className="relative font-mono text-[10px] uppercase tracking-[0.2em] text-cream/40">
          旺角 · 每日 13:00 – 21:00
        </p>
      </div>

      {/* 右：表單 */}
      <div className="flex items-center justify-center p-6 md:p-14">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-baseline gap-2 md:hidden">
            <span className="whitespace-nowrap font-display text-xl font-black tracking-tight">
              日日新格仔鋪
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
              GridBox.hk
            </span>
          </Link>

          {/* 模式切換 */}
          <div className="mb-8 grid grid-cols-2 border border-ink/30">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`py-3 text-[14px] font-medium tracking-wide transition-colors ${
                  mode === m
                    ? "bg-ink text-cream"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                {m === "login" ? "登入" : "註冊"}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate({ username: lUser.trim(), password: lPass });
              }}
            >
              <label className="block">
                <span className="spec-label mb-1.5 block">用戶名</span>
                <input
                  className="underline-input font-mono"
                  value={lUser}
                  onChange={(e) => setLUser(e.target.value)}
                  placeholder="chan_tai_man"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="spec-label mb-1.5 block">密碼</span>
                <input
                  type="password"
                  className="underline-input font-mono"
                  value={lPass}
                  onChange={(e) => setLPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-ink px-6 py-4 text-[15px] font-semibold tracking-wide text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                style={{ boxShadow: "5px 5px 0 0 rgba(179,156,79,1)" }}
              >
                {pending ? "登入中…" : "登入"}
              </button>
              <p className="text-[12.5px] leading-[1.85] text-ink/60">
                未有戶口？撳上面「註冊」開戶。
              </p>
            </form>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (rPass !== rPass2)
                  return toast.error("兩次輸入嘅密碼唔一樣");
                register.mutate({
                  username: rUser.trim(),
                  password: rPass,
                  name: rName.trim(),
                });
              }}
            >
              <label className="block">
                <span className="spec-label mb-1.5 block">
                  用戶名（登入用）
                </span>
                <input
                  className="underline-input font-mono"
                  value={rUser}
                  onChange={(e) => setRUser(e.target.value)}
                  placeholder="3–32 個字符：中英文、數字、_ . -"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="spec-label mb-1.5 block">顯示名稱</span>
                <input
                  className="underline-input"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  placeholder="陳大文"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="spec-label mb-1.5 block">密碼</span>
                  <input
                    type="password"
                    className="underline-input font-mono"
                    value={rPass}
                    onChange={(e) => setRPass(e.target.value)}
                    placeholder="最少 6 位"
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="spec-label mb-1.5 block">確認密碼</span>
                  <input
                    type="password"
                    className="underline-input font-mono"
                    value={rPass2}
                    onChange={(e) => setRPass2(e.target.value)}
                    placeholder="再輸入一次"
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-ink px-6 py-4 text-[15px] font-semibold tracking-wide text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                style={{ boxShadow: "5px 5px 0 0 rgba(179,156,79,1)" }}
              >
                {pending ? "註冊中…" : "註冊並登入"}
              </button>
              <p className="border border-ochre-deep/50 bg-ochre/10 px-4 py-3 text-[12.5px] leading-[1.85] text-ink/75">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep">
                  注意 —{" "}
                </span>
                公開註冊嘅戶口一律係<strong>租戶（唯讀）</strong>
                。註冊後請通知店主，
                由店主喺後台「租戶管理」連結你嘅格仔，先睇到銷售記錄。店員戶口由店主開立。
              </p>
            </form>
          )}

          {config?.demoMode && <hr className="dotline my-8" />}

          {/* Demo 試用：只喺伺服器 DEMO_MODE=true 先顯示 */}
          {config?.demoMode && (
            <div>
              <p className="spec-label mb-3">Demo — 免註冊試用</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => demo.mutate({ kind: "owner" })}
                  className="border border-ink bg-ink px-4 py-3.5 text-[13.5px] font-semibold tracking-wide text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                  style={{ boxShadow: "4px 4px 0 0 rgba(179,156,79,1)" }}
                >
                  {demo.isPending && demo.variables?.kind === "owner"
                    ? "進入中…"
                    : "店主 Demo"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => demo.mutate({ kind: "tenant" })}
                  className="border border-ink/60 px-4 py-3.5 text-[13.5px] font-semibold tracking-wide transition-colors hover:bg-ink hover:text-cream disabled:opacity-40"
                >
                  {demo.isPending && demo.variables?.kind === "tenant"
                    ? "進入中…"
                    : "租戶 Demo"}
                </button>
              </div>
              <p className="mt-3 font-mono text-[11px] leading-[1.8] text-ink/50">
                示範模式：一撳直入，唔使密碼。資料全部係示範數據，正式開舖前會關閉。
              </p>
            </div>
          )}

          {config && !config.hasOwner && (
            <p className="mt-6 border border-red-700/40 bg-red-50 px-4 py-3 text-[12.5px] leading-[1.85] text-red-900">
              系統未設定店主戶口。管理員請喺伺服器設定 OWNER_USERNAME /
              OWNER_PASSWORD，或者執行
              <code className="mx-1 font-mono">npm run owner:create</code>。
            </p>
          )}

          <p className="mt-8">
            <Link
              to="/"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-ochre-deep underline-offset-4 hover:underline"
            >
              ← 返回宣傳頁
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router";
import Noise from "@/components/Noise";

/** 登入後頁面共用版頭 */
export default function DashHeader({ roleLabel }: { roleLabel: string }) {
  const { user, logout } = useAuth();
  return (
    <>
      <Noise />
      <header className="sticky top-0 z-50 border-b border-ink/15 bg-cream/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-baseline gap-3">
            <Link to="/" className="flex items-baseline gap-2">
              <span className="font-display text-xl font-black tracking-tight">格仔鋪</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/55">GridBox.hk</span>
            </Link>
            <span className="badge-frame border border-ink/40 text-ink/70">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden font-mono text-[12px] text-ink/60 sm:inline">{user?.name ?? user?.email ?? ""}</span>
            <button
              onClick={() => logout()}
              className="border border-ink/45 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-cream"
            >
              登出
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

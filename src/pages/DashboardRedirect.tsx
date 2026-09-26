import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";

/** 按身份分流：店主 → /admin，店員 → /staff，租客 → /tenant */
export default function DashboardRedirect() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      const dest = user.role === "admin" ? "/admin" : user.role === "staff" ? "/staff" : "/tenant";
      navigate(dest, { replace: true });
    }
  }, [isLoading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-ink/50">進入專區中…</p>
    </div>
  );
}

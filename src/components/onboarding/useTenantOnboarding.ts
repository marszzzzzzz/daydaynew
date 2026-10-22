import { useCallback, useState } from "react";
import { trpc } from "@/providers/trpc";

type Phase = "wizard" | "edit" | "tour" | null;
const LATER_KEY = "gridbox:onboarding-later";

function readLater(userId: number) {
  try {
    return sessionStorage.getItem(LATER_KEY) === String(userId);
  } catch {
    return false;
  }
}

/**
 * 租戶引導狀態：未完成（onboardedAt = null）就自動開引導；
 * 撳「稍後」只係呢次瀏覽唔再彈，下次登入會再提。
 */
export function useTenantOnboarding(user: { id: number; onboardedAt: Date | string | null } | null | undefined, ready: boolean) {
  const [phase, setPhase] = useState<Phase>(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const utils = trpc.useUtils();
  const complete = trpc.account.completeOnboarding.useMutation({
    onSuccess: () => void utils.auth.me.invalidate(),
  });

  // 第一次載入完成後自動打開（render 期間判斷，避免多一次 effect）
  if (ready && user && !autoOpened) {
    setAutoOpened(true);
    if (!user.onboardedAt && !readLater(user.id)) setPhase("wizard");
  }

  const finish = useCallback(() => {
    setPhase(null);
    if (!user?.onboardedAt) complete.mutate();
  }, [user?.onboardedAt, complete]);

  const later = useCallback(() => {
    setPhase(null);
    try {
      if (user) sessionStorage.setItem(LATER_KEY, String(user.id));
    } catch {
      /* 私隱模式寫唔到就算，只係會再彈一次 */
    }
  }, [user]);

  return {
    phase,
    startTour: useCallback(() => setPhase("tour"), []),
    editProfile: useCallback(() => setPhase("edit"), []),
    finish,
    later,
  };
}

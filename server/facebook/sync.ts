import { ruleInsight, type FbInsight } from "@contracts/facebook";
import { env } from "../lib/env";
import * as q from "../queries/facebook";
import { aiInsight, isTransientAiError, needsAi } from "./analyze";
import { FacebookError, fetchPostsPage, isFacebookConfigured } from "./graph";

/** 第一次同步最多讀幾頁（每頁 25 篇） */
const MAX_PAGES = 2;
/** 每次同步最多用 AI 整理幾篇（並行），其餘下次再做；Vercel function 限 30 秒 */
const AI_PER_SYNC = 6;

/** 用 AI 整理一篇；失敗就用規則結果，暫時性錯誤留待下次 */
export async function analyzePost(post: { id: number; message: string; createdTime: Date }): Promise<{ insight: FbInsight; by: "ai" | "rule" }> {
  if (!env.aiEnabled || !needsAi(post.message)) {
    const insight = ruleInsight(post.message);
    await q.saveInsight(post.id, insight, "rule", false);
    return { insight, by: "rule" };
  }
  try {
    const insight = await aiInsight(post.message, post.createdTime);
    await q.saveInsight(post.id, insight, "ai", false);
    return { insight, by: "ai" };
  } catch (e) {
    console.error("[facebook] AI 整理失敗", post.id, e instanceof Error ? e.message : e);
    const insight = ruleInsight(post.message);
    await q.saveInsight(post.id, insight, "rule", isTransientAiError(e));
    return { insight, by: "rule" };
  }
}

async function analyzePending() {
  const pending = await q.listPendingAi(AI_PER_SYNC);
  const results = await Promise.all(pending.map((p) => analyzePost(p)));
  return results.filter((r) => r.by === "ai").length;
}

/** 讀新帖（新到舊，見到已有嘅就停）→ 規則整理入收件箱 → AI 補整理 */
export async function runSync(): Promise<{ newPosts: number; analyzed: number }> {
  if (!isFacebookConfigured()) throw new FacebookError("未設定 Facebook：請先喺 Vercel 加 FB_PAGE_ID 同 FB_PAGE_TOKEN");
  try {
    let newPosts = 0;
    let next: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchPostsPage(next);
      const known = await q.existingPostIds(res.posts.map((p) => p.id));
      const fresh = res.posts.filter((p) => !known.has(p.id));
      newPosts += await q.insertPosts(
        fresh.map((post) => ({ post, insight: ruleInsight(post.message ?? ""), aiPending: env.aiEnabled && needsAi(post.message ?? "") })),
      );
      if (fresh.length < res.posts.length || !res.next) break;
      next = res.next;
    }
    const analyzed = await analyzePending();
    const ai = env.aiEnabled ? `，AI 整理 ${analyzed} 篇` : "";
    await q.recordSync(true, `新帖 ${newPosts} 篇${ai}`, newPosts);
    return { newPosts, analyzed };
  } catch (e) {
    const message = e instanceof FacebookError ? e.message : "同步失敗，請稍後再試";
    if (!(e instanceof FacebookError)) console.error("[facebook] 同步失敗", e);
    await q.recordSync(false, message, 0);
    throw e instanceof FacebookError ? e : new FacebookError(message);
  }
}

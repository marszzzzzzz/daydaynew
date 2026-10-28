import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { fbPosts, fbSync } from "@db/schema";
import type { FbInsight, FbPostStatus, GraphPost } from "@contracts/facebook";
import { getDb } from "./connection";

const SYNC_ID = 1;

export async function existingPostIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await getDb().select({ postId: fbPosts.postId }).from(fbPosts).where(inArray(fbPosts.postId, ids));
  return new Set(rows.map((r) => r.postId));
}

/** 新帖入收件箱；同時跑兩次同步都唔會重複 */
export async function insertPosts(posts: { post: GraphPost; insight: FbInsight; aiPending: boolean }[]) {
  if (posts.length === 0) return 0;
  const rows = await getDb()
    .insert(fbPosts)
    .values(
      posts.map(({ post, insight, aiPending }) => ({
        postId: post.id,
        createdTime: new Date(post.created_time),
        message: post.message ?? "",
        permalink: post.permalink_url ?? "",
        imageUrl: post.full_picture ?? "",
        type: insight.type,
        insight: JSON.stringify(insight),
        aiPending,
      })),
    )
    .onConflictDoNothing({ target: fbPosts.postId })
    .returning({ id: fbPosts.id });
  return rows.length;
}

export async function listPendingAi(limit: number) {
  return getDb().select().from(fbPosts).where(eq(fbPosts.aiPending, true)).orderBy(desc(fbPosts.createdTime)).limit(limit);
}

export async function saveInsight(id: number, insight: FbInsight, analyzedBy: "rule" | "ai", aiPending: boolean) {
  await getDb().update(fbPosts).set({ insight: JSON.stringify(insight), type: insight.type, analyzedBy, aiPending }).where(eq(fbPosts.id, id));
}

export async function findPost(id: number) {
  const [row] = await getDb().select().from(fbPosts).where(eq(fbPosts.id, id)).limit(1);
  return row ?? null;
}

export async function listPosts(status: FbPostStatus | "all", limit: number) {
  return getDb()
    .select()
    .from(fbPosts)
    .where(status === "all" ? undefined : eq(fbPosts.status, status))
    .orderBy(status === "new" ? asc(fbPosts.createdTime) : desc(fbPosts.createdTime))
    .limit(limit);
}

export async function countByStatus() {
  const rows = await getDb()
    .select({ status: fbPosts.status, n: sql<number>`count(*)` })
    .from(fbPosts)
    .groupBy(fbPosts.status);
  const counts = { new: 0, done: 0, ignored: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status as FbPostStatus] = Number(r.n);
  return counts;
}

export async function setStatus(id: number, status: FbPostStatus, action: string, userId: number) {
  const [row] = await getDb()
    .update(fbPosts)
    .set({ status, action, reviewedBy: userId, reviewedAt: status === "new" ? null : new Date() })
    .where(eq(fbPosts.id, id))
    .returning({ id: fbPosts.id });
  return !!row;
}

export async function readSync() {
  const [row] = await getDb().select().from(fbSync).where(eq(fbSync.id, SYNC_ID)).limit(1);
  return row ?? null;
}

export async function recordSync(ok: boolean, message: string, newPosts: number) {
  const values = { lastSyncAt: new Date(), lastOk: ok, lastMessage: message, lastNew: newPosts };
  await getDb()
    .insert(fbSync)
    .values({ id: SYNC_ID, ...values })
    .onConflictDoUpdate({ target: fbSync.id, set: values });
}

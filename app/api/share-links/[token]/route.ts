import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { handler, json } from '@/lib/server/http';

export const DELETE = handler<{ token: string }>(async (req, { token }) => {
  const u = await requireUser(req);
  const sql = await db();
  await sql`UPDATE share_link SET revoked = true WHERE token = ${token} AND user_id = ${u.id}`;
  return json({ ok: true });
});

import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, json, text } from '@/lib/server/http';
import { TAG_COLORS as COLORS } from '@/lib/types';

type P = { id: string };

export const PATCH = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  const set: Record<string, string> = {};
  if ('name' in b) { set.name = text(b.name, 24, 'name'); if (!set.name) throw new HttpError(400, 'Tag name required', 'BAD_REQUEST'); }
  if ('color' in b && COLORS.includes(String(b.color))) set.color = String(b.color);
  const sql = await db();
  const [tag] = Object.keys(set).length
    ? await sql`UPDATE tag SET ${sql(set)} WHERE id = ${id} AND user_id = ${u.id} RETURNING id, name, color`
    : await sql`SELECT id, name, color FROM tag WHERE id = ${id} AND user_id = ${u.id}`;
  if (!tag) throw new HttpError(404, 'Tag not found', 'NOT_FOUND');
  return json(tag);
});

export const DELETE = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const sql = await db();
  await sql`DELETE FROM tag WHERE id = ${id} AND user_id = ${u.id}`;
  return json({ ok: true });
});

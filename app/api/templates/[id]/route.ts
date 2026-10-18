import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, json, now } from '@/lib/server/http';
import { cleanTemplate, toTpl } from '@/lib/server/templates';

type P = { id: string };

export const PATCH = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const t = cleanTemplate(await body(req));
  const sql = await db();
  const [r] = await sql`UPDATE template SET ${sql({ ...t, updated_at: now() })} WHERE id = ${id} AND user_id = ${u.id} RETURNING *`;
  if (!r) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  return json(toTpl(r));
});

export const DELETE = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const sql = await db();
  await sql`DELETE FROM template WHERE id = ${id} AND user_id = ${u.id}`;
  return json({ ok: true });
});

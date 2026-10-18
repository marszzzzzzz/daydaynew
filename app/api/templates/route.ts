import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, id, json, now } from '@/lib/server/http';
import { cleanTemplate, toTpl } from '@/lib/server/templates';

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const sql = await db();
  const rows = await sql`SELECT * FROM template WHERE user_id = ${u.id} ORDER BY channel DESC, created_at`;
  return json({ templates: rows.map(toTpl) });
});

export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const t = cleanTemplate(await body(req));
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM template WHERE user_id = ${u.id}`;
  if (n >= 50) throw new HttpError(400, 'Up to 50 templates', 'LIMIT');
  const at = now();
  const [r] = await sql`INSERT INTO template ${sql({ id: id('tpl'), user_id: u.id, ...t, created_at: at, updated_at: at })} RETURNING *`;
  return json(toTpl(r), 201);
});

import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, id, json, text } from '@/lib/server/http';
import { TAG_COLORS as COLORS } from '@/lib/types';


export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const sql = await db();
  const tags = await sql`
    SELECT t.id, t.name, t.color, (SELECT count(*)::int FROM contact_tag ct JOIN contact c ON c.id = ct.contact_id WHERE ct.tag_id = t.id AND NOT c.archived) AS count
    FROM tag t WHERE t.user_id = ${u.id} ORDER BY t.name`;
  return json({ tags });
});

export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const name = text(b.name, 24, 'name');
  if (!name) throw new HttpError(400, 'Tag name required', 'BAD_REQUEST');
  const color = COLORS.includes(String(b.color)) ? String(b.color) : 'slate';
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM tag WHERE user_id = ${u.id}`;
  if (n >= 100) throw new HttpError(400, 'Up to 100 tags', 'LIMIT');
  const [tag] = await sql`INSERT INTO tag (id, user_id, name, color) VALUES (${id('tag')}, ${u.id}, ${name}, ${color}) RETURNING id, name, color`;
  return json(tag, 201);
});

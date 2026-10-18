import { requireUser } from '@/lib/server/auth';
import { deleteContacts } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, json, now } from '@/lib/server/http';

/** Bulk actions on selected contacts (spec §5): tag, untag, archive, unarchive, star, unstar, delete. */
export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body<{ ids?: unknown; action?: unknown; tagId?: unknown }>(req);
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 5000) throw new HttpError(400, 'ids[] required', 'BAD_REQUEST');
  const ids = b.ids.map(String);
  const sql = await db();
  const t = now();
  let n = 0;
  switch (b.action) {
    case 'tag':
    case 'untag': {
      const [tag] = await sql`SELECT id FROM tag WHERE id = ${String(b.tagId)} AND user_id = ${u.id}`;
      if (!tag) throw new HttpError(400, 'Unknown tag', 'BAD_TAG');
      const mine = await sql<{ id: string }[]>`SELECT id FROM contact WHERE user_id = ${u.id} AND id = ANY(${ids}::text[])`;
      const own = mine.map((r) => r.id);
      if (b.action === 'tag') await sql`INSERT INTO contact_tag (contact_id, tag_id) SELECT x, ${tag.id} FROM unnest(${own}::text[]) AS x ON CONFLICT DO NOTHING`;
      else await sql`DELETE FROM contact_tag WHERE tag_id = ${tag.id} AND contact_id = ANY(${own}::text[])`;
      await sql`UPDATE contact SET updated_at = ${t} WHERE id = ANY(${own}::text[])`;
      n = own.length;
      break;
    }
    case 'archive':
    case 'unarchive':
      n = (await sql`UPDATE contact SET archived = ${b.action === 'archive'}, updated_at = ${t} WHERE user_id = ${u.id} AND id = ANY(${ids}::text[]) RETURNING id`).length;
      break;
    case 'star':
    case 'unstar':
      n = (await sql`UPDATE contact SET starred = ${b.action === 'star'}, updated_at = ${t} WHERE user_id = ${u.id} AND id = ANY(${ids}::text[]) RETURNING id`).length;
      break;
    case 'delete':
      n = await deleteContacts(u.id, ids);
      break;
    default:
      throw new HttpError(400, 'Unknown action', 'BAD_REQUEST');
  }
  return json({ ok: true, count: n });
});

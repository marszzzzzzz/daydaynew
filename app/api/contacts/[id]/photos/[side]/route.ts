import { requireUser } from '@/lib/server/auth';
import { deletePhotos, readPhoto, savePhoto, sniffImage } from '@/lib/server/blob';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { HttpError, handler, json, now } from '@/lib/server/http';
import type { PhotoSide } from '@/lib/types';

type P = { id: string; side: string };
const MAX = 2 * 1024 * 1024;

function sideOf(s: string): PhotoSide {
  const v = s.toUpperCase();
  if (v !== 'FRONT' && v !== 'BACK') throw new HttpError(404, 'No such side', 'NOT_FOUND');
  return v;
}

export const PUT = handler<P>(async (req, p) => {
  const u = await requireUser(req);
  const side = sideOf(p.side);
  await getContact(u.id, p.id);
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX) throw new HttpError(413, 'Photo is larger than 2 MB', 'TOO_LARGE');
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'Photos must be JPEG, PNG or WebP', 'BAD_IMAGE');
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  const t = now();
  const sql = await db();
  const [old] = await sql<{ blob_path: string }[]>`SELECT blob_path FROM contact_photo WHERE contact_id = ${p.id} AND side = ${side}`;
  const path = await savePhoto(`cards/${u.id}/${p.id}/${side.toLowerCase()}-${t}.${ext}`, buf, type);
  await sql`INSERT INTO contact_photo (contact_id, side, blob_path, uploaded_at) VALUES (${p.id}, ${side}, ${path}, ${t})
            ON CONFLICT (contact_id, side) DO UPDATE SET blob_path = EXCLUDED.blob_path, uploaded_at = EXCLUDED.uploaded_at`;
  await sql`UPDATE contact SET updated_at = ${t} WHERE id = ${p.id}`;
  if (old && old.blob_path !== path) await deletePhotos([old.blob_path]);
  return json({ ok: true, v: t });
});

export const GET = handler<P>(async (req, p) => {
  const u = await requireUser(req);
  const side = sideOf(p.side);
  const sql = await db();
  const [row] = await sql<{ blob_path: string }[]>`
    SELECT ph.blob_path FROM contact_photo ph JOIN contact c ON c.id = ph.contact_id WHERE c.id = ${p.id} AND c.user_id = ${u.id} AND ph.side = ${side}`;
  if (!row) throw new HttpError(404, 'No photo', 'NOT_FOUND');
  const f = await readPhoto(row.blob_path);
  if (!f) throw new HttpError(404, 'No photo', 'NOT_FOUND');
  return new Response(f.body as BodyInit, { headers: { 'content-type': f.contentType, 'cache-control': 'private, max-age=86400' } });
});

export const DELETE = handler<P>(async (req, p) => {
  const u = await requireUser(req);
  const side = sideOf(p.side);
  await getContact(u.id, p.id);
  const sql = await db();
  const rows = await sql<{ blob_path: string }[]>`DELETE FROM contact_photo WHERE contact_id = ${p.id} AND side = ${side} RETURNING blob_path`;
  await deletePhotos(rows.map((r) => r.blob_path));
  return json({ ok: true });
});

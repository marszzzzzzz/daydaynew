import { randomBytes } from 'node:crypto';
import { requireUser } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { baseUrl, body, handler, json, now } from '@/lib/server/http';

const DAYS = 7;

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const sql = await db();
  const base = baseUrl(req);
  const rows = await sql<{ token: string; contact_id: string | null; name: string | null; expires_at: string; revoked: boolean; views: number }[]>`
    SELECT s.token, s.contact_id, NULLIF(TRIM(COALESCE(c.name_zh, '') || ' ' || COALESCE(c.name_en, '')), '') AS name, s.expires_at, s.revoked, s.views
    FROM share_link s LEFT JOIN contact c ON c.id = s.contact_id WHERE s.user_id = ${u.id} ORDER BY s.created_at DESC LIMIT 100`;
  return json({ links: rows.map((r) => ({ token: r.token, contactId: r.contact_id, contactName: r.name, url: `${base}/v/${r.token}`, expiresAt: Number(r.expires_at), revoked: r.revoked, views: r.views })) });
});

/** A 7-day link that downloads one vCard (spec §7.3) — WhatsApp links can't carry files. contactId null = my own card. */
export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const contactId = typeof b.contactId === 'string' && b.contactId ? (await getContact(u.id, b.contactId)).id : null;
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now() + DAYS * 864e5;
  const sql = await db();
  await sql`INSERT INTO share_link (token, user_id, contact_id, expires_at, created_at) VALUES (${token}, ${u.id}, ${contactId}, ${expiresAt}, ${now()})`;
  return json({ token, url: `${baseUrl(req)}/v/${token}`, expiresAt }, 201);
});

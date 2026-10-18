import { validE164 } from '@/lib/phone';
import { requireUser } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { EMAIL_RE, HttpError, body, handler, json, longText, now, text } from '@/lib/server/http';
import { BODY_MAX, EDITABLE, getMessage } from '@/lib/server/messages';

type P = { id: string };

export const GET = handler<P>(async (req, { id }) => json(await getMessage((await requireUser(req)).id, id)));

/** Autosave (spec §8.2). Must carry the `version` it was based on; a stale version gets 409 with the current copy. */
export const PATCH = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  const cur = await getMessage(u.id, id);
  if (!EDITABLE.includes(cur.status)) throw new HttpError(409, 'A sent message cannot be changed', 'SENT_LOCKED', cur);
  const version = Number(b.version);
  if (!Number.isInteger(version)) throw new HttpError(400, 'version required', 'BAD_REQUEST');
  const set: Record<string, unknown> = {};
  if ('subject' in b) set.subject = text(b.subject, 200, 'subject');
  if ('body' in b) set.body = longText(b.body, BODY_MAX[cur.channel], 'body');
  if ('toAddress' in b) {
    let to = text(b.toAddress, 254, 'toAddress');
    if (cur.channel === 'EMAIL') to = to.toLowerCase();
    if (to && cur.channel === 'WHATSAPP' && !validE164(to)) throw new HttpError(400, 'Not a valid WhatsApp number', 'BAD_PHONE');
    if (to && cur.channel === 'EMAIL' && !EMAIL_RE.test(to)) throw new HttpError(400, 'Not a valid e-mail address', 'BAD_EMAIL');
    set.to_address = to;
  }
  if ('contactId' in b) set.contact_id = b.contactId ? (await getContact(u.id, String(b.contactId))).id : null;
  if ('attachVcardOf' in b) set.attach_vcard_of = b.attachVcardOf ? (await getContact(u.id, String(b.attachVcardOf))).id : null;
  if ('attachMyCard' in b) set.attach_my_card = !!b.attachMyCard;
  const sql = await db();
  const r = await sql`UPDATE message SET ${sql({ ...set, version: version + 1, updated_at: now() } as unknown as Record<string, string>)}
                      WHERE id = ${id} AND user_id = ${u.id} AND version = ${version} AND status IN ('DRAFT', 'OPENED', 'FAILED') RETURNING id`;
  if (!r.length) throw new HttpError(409, 'This draft was changed on another device', 'VERSION_CONFLICT', await getMessage(u.id, id));
  return json(await getMessage(u.id, id));
});

export const DELETE = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  const sql = await db();
  await sql`DELETE FROM message WHERE id = ${id} AND user_id = ${u.id}`;
  return json({ ok: true });
});

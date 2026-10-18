import { requireUser } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { HttpError, handler, id as newId, json, now } from '@/lib/server/http';
import { mailEnabled, sendMail } from '@/lib/server/mail';
import { myCard } from '@/lib/server/me';
import { EDITABLE, getMessage } from '@/lib/server/messages';
import { toVCard, vcfName } from '@/lib/vcard';

type P = { id: string; action: string };
const DAY = 864e5;

/**
 * opened    — WhatsApp / mail app was opened with this text (the app can't know if it was sent).
 * mark-sent — the user says it went out.
 * send      — the system sends the e-mail through Resend (spec §8.1 B), with limits: 50 a day, 5 a minute,
 *             3 per recipient per 24 h; addresses that bounced are refused.
 * copy      — a new draft with the same content (sent messages can't be edited).
 */
export const POST = handler<P>(async (req, { id, action }) => {
  const u = await requireUser(req);
  const sql = await db();
  const m = await getMessage(u.id, id);
  const t = now();

  if (action === 'opened') {
    if (EDITABLE.includes(m.status)) await sql`UPDATE message SET status = 'OPENED', version = version + 1, updated_at = ${t} WHERE id = ${id}`;
    return json(await getMessage(u.id, id));
  }
  if (action === 'mark-sent') {
    if (m.status !== 'SENT') await sql`UPDATE message SET status = 'SENT', sent_at = ${t}, error = NULL, version = version + 1, updated_at = ${t} WHERE id = ${id}`;
    return json(await getMessage(u.id, id));
  }
  if (action === 'copy') {
    const mid = newId('msg');
    await sql`INSERT INTO message (id, user_id, channel, status, contact_id, to_address, subject, body, attach_vcard_of, attach_my_card, template_id, version, created_at, updated_at)
              SELECT ${mid}, user_id, channel, 'DRAFT', contact_id, to_address, subject, body, attach_vcard_of, attach_my_card, template_id, 1, ${t}, ${t}
              FROM message WHERE id = ${id} AND user_id = ${u.id}`;
    return json(await getMessage(u.id, mid), 201);
  }
  if (action !== 'send') throw new HttpError(404, 'Unknown action', 'NOT_FOUND');

  if (m.channel !== 'EMAIL') throw new HttpError(400, 'Only e-mail can be sent by the system', 'BAD_REQUEST');
  if (!EDITABLE.includes(m.status)) throw new HttpError(409, 'Already sent', 'SENT_LOCKED');
  if (!mailEnabled()) throw new HttpError(503, 'System e-mail is not set up on this site', 'MAIL_DISABLED');
  if (!u.email || !u.email_verified_at) throw new HttpError(400, 'Verify your own e-mail address first', 'EMAIL_UNVERIFIED');
  if (!m.toAddress) throw new HttpError(400, 'Add a recipient', 'NO_RECIPIENT');
  if (!m.subject.trim()) throw new HttpError(400, 'Add a subject', 'NO_SUBJECT');
  const [blocked] = await sql`SELECT reason FROM email_block WHERE user_id = ${u.id} AND email = ${m.toAddress}`;
  if (blocked) throw new HttpError(400, 'Mail to this address could not be delivered before', 'UNDELIVERABLE');
  const [lim] = await sql<{ day: number; minute: number; rcpt: number }[]>`
    SELECT count(*) FILTER (WHERE sent_at > ${t - DAY})::int AS day, count(*) FILTER (WHERE sent_at > ${t - 60_000})::int AS minute,
           count(*) FILTER (WHERE sent_at > ${t - DAY} AND to_address = ${m.toAddress})::int AS rcpt
    FROM message WHERE user_id = ${u.id} AND channel = 'EMAIL' AND provider_id IS NOT NULL`;
  if (lim.day >= 50) throw new HttpError(429, 'Daily limit reached (50 e-mails)', 'RATE_DAY');
  if (lim.minute >= 5) throw new HttpError(429, 'Please wait a minute (5 e-mails per minute)', 'RATE_MINUTE');
  if (lim.rcpt >= 3) throw new HttpError(429, 'Up to 3 e-mails to the same person per 24 hours', 'RATE_RECIPIENT');

  const attachments: { filename: string; content: string }[] = [];
  if (m.attachVcardOf) {
    const c = await getContact(u.id, m.attachVcardOf);
    attachments.push({ filename: vcfName(c), content: Buffer.from(toVCard(c)).toString('base64') });
  }
  if (m.attachMyCard) {
    const mine = myCard(u);
    attachments.push({ filename: vcfName(mine), content: Buffer.from(toVCard(mine)).toString('base64') });
  }
  try {
    const providerId = await sendMail({ to: m.toAddress, subject: m.subject, text: m.body, replyTo: u.email, fromName: u.display_name || u.name, attachments });
    await sql`UPDATE message SET status = 'SENT', provider_id = ${providerId}, sent_at = ${now()}, error = NULL, version = version + 1, updated_at = ${now()} WHERE id = ${id}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send failed';
    await sql`UPDATE message SET status = 'FAILED', error = ${msg.slice(0, 500)}, version = version + 1, updated_at = ${now()} WHERE id = ${id}`;
  }
  return json(await getMessage(u.id, id));
});

import { validE164 } from '@/lib/phone';
import { requireUser } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { EMAIL_RE, HttpError, body, handler, id, json, longText, now, text } from '@/lib/server/http';
import { BODY_MAX, getMessage, listMessages } from '@/lib/server/messages';
import { fill, variables } from '@/lib/template';
import type { Channel } from '@/lib/types';

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const p = req.nextUrl.searchParams;
  return json({ messages: await listMessages(u.id, { status: p.get('status') ?? undefined, channel: p.get('channel') ?? undefined, contact: p.get('contact') ?? undefined }) });
});

/** New draft. With templateId the template is filled in right away (spec §8.3); later template edits don't touch it. */
export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const channel: Channel = b.channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const sql = await db();
  const contact = typeof b.contactId === 'string' && b.contactId ? await getContact(u.id, b.contactId) : null;
  let subject = text(b.subject, 200, 'subject');
  let msgBody = longText(b.body, BODY_MAX[channel], 'body');
  let templateId: string | null = null;
  if (typeof b.templateId === 'string' && b.templateId) {
    const [tpl] = await sql<{ id: string; subject: string; body: string }[]>`SELECT id, subject, body FROM template WHERE id = ${b.templateId} AND user_id = ${u.id}`;
    if (!tpl) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
    const vars = variables(contact, { displayName: u.display_name, name: u.name, myCompany: u.my_company, whatsapp: u.whatsapp, email: u.email, signature: u.signature });
    templateId = tpl.id;
    subject = subject || fill(tpl.subject, vars).text;
    msgBody = (fill(tpl.body, vars).text + (msgBody ? `\n${msgBody}` : '')).slice(0, BODY_MAX[channel]);
  }
  let to = text(b.toAddress, 254, 'toAddress');
  if (!to && contact) {
    to = channel === 'WHATSAPP'
      ? (contact.phones.find((p) => p.whatsapp)?.e164 ?? contact.phones.find((p) => p.kind === 'MOBILE')?.e164 ?? '')
      : (contact.emails.find((e) => e.isPrimary)?.email ?? contact.emails[0]?.email ?? '');
  }
  if (to && channel === 'WHATSAPP' && !validE164(to)) throw new HttpError(400, 'Not a valid WhatsApp number', 'BAD_PHONE');
  if (to && channel === 'EMAIL' && !EMAIL_RE.test(to)) throw new HttpError(400, 'Not a valid e-mail address', 'BAD_EMAIL');
  let attachOf: string | null = null;
  if (typeof b.attachVcardOf === 'string' && b.attachVcardOf) attachOf = (await getContact(u.id, b.attachVcardOf)).id;
  const mid = id('msg');
  const t = now();
  await sql`INSERT INTO message ${sql({
    id: mid, user_id: u.id, channel, status: 'DRAFT', contact_id: contact?.id ?? null, to_address: channel === 'EMAIL' ? to.toLowerCase() : to,
    subject, body: msgBody, attach_vcard_of: attachOf, attach_my_card: !!b.attachMyCard, template_id: templateId, version: 1, created_at: t, updated_at: t,
  } as unknown as Record<string, string>)}`;
  return json(await getMessage(u.id, mid), 201);
});

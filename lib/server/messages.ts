// Drafts and sent messages (spec §8.2): one recipient per message, optimistic locking with `version`.
import 'server-only';
import type { Channel, Message, MessageStatus } from '@/lib/types';
import { db, type Sql } from './db';
import { HttpError } from './http';

interface Row {
  id: string; channel: Channel; status: MessageStatus; contact_id: string | null; contact_name: string | null; to_address: string;
  subject: string; body: string; attach_vcard_of: string | null; attach_my_card: boolean; template_id: string | null; error: string | null;
  version: number; created_at: string; updated_at: string; sent_at: string | null;
}

export const toMessage = (r: Row): Message => ({
  id: r.id, channel: r.channel, status: r.status, contactId: r.contact_id, contactName: r.contact_name, toAddress: r.to_address,
  subject: r.subject, body: r.body, attachVcardOf: r.attach_vcard_of, attachMyCard: r.attach_my_card, templateId: r.template_id,
  error: r.error, version: r.version, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), sentAt: r.sent_at ? Number(r.sent_at) : null,
});

const SELECT = `m.id, m.channel, m.status, m.contact_id, NULLIF(TRIM(COALESCE(c.name_zh, '') || ' ' || COALESCE(c.name_en, '')), '') AS contact_name,
  m.to_address, m.subject, m.body, m.attach_vcard_of, m.attach_my_card, m.template_id, m.error, m.version, m.created_at, m.updated_at, m.sent_at`;

export async function getMessage(userId: string, mid: string, sql?: Sql): Promise<Message> {
  sql ??= await db();
  const [r] = await sql.unsafe<Row[]>(`SELECT ${SELECT} FROM message m LEFT JOIN contact c ON c.id = m.contact_id WHERE m.id = $1 AND m.user_id = $2`, [mid, userId]);
  if (!r) throw new HttpError(404, 'Message not found', 'NOT_FOUND');
  return toMessage(r);
}

export async function listMessages(userId: string, o: { status?: string; channel?: string; contact?: string }) {
  const sql = await db();
  const where = ['m.user_id = $1'];
  const args: unknown[] = [userId];
  const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
  if (o.status === 'drafts') where.push(`m.status IN ('DRAFT', 'OPENED', 'FAILED')`);
  else if (o.status === 'sent') where.push(`m.status = 'SENT'`);
  else if (o.status) where.push(`m.status = ${arg(o.status)}`);
  if (o.channel === 'WHATSAPP' || o.channel === 'EMAIL') where.push(`m.channel = ${arg(o.channel)}`);
  if (o.contact) where.push(`m.contact_id = ${arg(o.contact)}`);
  const rows = await sql.unsafe<Row[]>(`SELECT ${SELECT} FROM message m LEFT JOIN contact c ON c.id = m.contact_id WHERE ${where.join(' AND ')} ORDER BY m.updated_at DESC LIMIT 300`, args as never[]);
  return rows.map(toMessage);
}

export const EDITABLE: MessageStatus[] = ['DRAFT', 'OPENED', 'FAILED'];
export const BODY_MAX: Record<Channel, number> = { WHATSAPP: 4000, EMAIL: 20000 };

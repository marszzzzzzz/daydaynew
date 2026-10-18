import 'server-only';
import { HttpError, longText, text } from './http';

export const toTpl = (r: Record<string, unknown>) => ({ id: r.id, channel: r.channel, name: r.name, subject: r.subject, body: r.body, updatedAt: Number(r.updated_at) });

export function cleanTemplate(b: Record<string, unknown>) {
  const channel = b.channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const name = text(b.name, 60, 'name');
  if (!name) throw new HttpError(400, 'Template name required', 'BAD_REQUEST');
  return { channel, name, subject: text(b.subject, 200, 'subject'), body: longText(b.body, channel === 'EMAIL' ? 20000 : 4000, 'body') };
}


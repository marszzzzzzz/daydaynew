// System-sent e-mail through Resend's REST API (spec §8.1 B). Off unless RESEND_API_KEY and MAIL_FROM are set.
import 'server-only';
import { HttpError } from './http';

export const mailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

export interface Mail { to: string; subject: string; text: string; replyTo?: string | null; fromName?: string; attachments?: { filename: string; content: string }[] }

export async function sendMail(m: Mail): Promise<string> {
  if (!mailEnabled()) throw new HttpError(503, 'System e-mail is not set up on this site', 'MAIL_DISABLED');
  const from = process.env.MAIL_FROM!;
  // "Name <noreply@domain>": show the user's name with the site's verified address.
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const name = (m.fromName ?? '').replace(/["<>\r\n]/g, '').trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: name ? `${name} <${addr}>` : from, to: [m.to], subject: m.subject, text: m.text,
      reply_to: m.replyTo ? [m.replyTo] : undefined, attachments: m.attachments,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) throw new HttpError(502, data.message || `Mail service error (${res.status})`, 'MAIL_FAILED');
  return data.id;
}

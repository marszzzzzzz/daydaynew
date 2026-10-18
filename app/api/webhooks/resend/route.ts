// Resend bounce / complaint webhook (spec §8.1): the address is marked undeliverable for that user.
// Signed with Svix: HMAC-SHA256 over "id.timestamp.body" using RESEND_WEBHOOK_SECRET (whsec_…).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/server/db';
import { json, now } from '@/lib/server/http';

function verify(req: NextRequest, payload: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = req.headers.get('svix-id'), ts = req.headers.get('svix-timestamp'), sig = req.headers.get('svix-signature');
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest();
  return sig.split(' ').some((part) => {
    const got = Buffer.from(part.split(',')[1] ?? '', 'base64');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verify(req, payload)) return json({ error: 'Bad signature', code: 'BAD_SIGNATURE' }, 401);
  const ev = JSON.parse(payload) as { type?: string; data?: { email_id?: string } };
  if ((ev.type === 'email.bounced' || ev.type === 'email.complained') && ev.data?.email_id) {
    const sql = await db();
    const [m] = await sql<{ user_id: string; to_address: string }[]>`SELECT user_id, to_address FROM message WHERE provider_id = ${ev.data.email_id}`;
    if (m) {
      await sql`INSERT INTO email_block (user_id, email, reason, created_at) VALUES (${m.user_id}, ${m.to_address}, ${ev.type}, ${now()}) ON CONFLICT DO NOTHING`;
      await sql`UPDATE message SET error = ${ev.type === 'email.bounced' ? 'Bounced' : 'Marked as spam'} WHERE provider_id = ${ev.data.email_id}`;
    }
  }
  return json({ ok: true });
}

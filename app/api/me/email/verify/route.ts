import { createHash, randomInt } from 'node:crypto';
import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, handler, json, now } from '@/lib/server/http';
import { sendMail } from '@/lib/server/mail';

/** Send a 6-digit code to the account's e-mail (needed before the system sends mail for the user, spec §8.1). */
export const POST = handler(async (req) => {
  const u = await requireUser(req);
  if (!u.email) throw new HttpError(400, 'Add an e-mail address first', 'NO_EMAIL');
  if (u.email_verified_at) return json({ ok: true, verified: true });
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sql = await db();
  await sql`UPDATE app_user SET email_code_hash = ${createHash('sha256').update(`${u.id}:${code}`).digest('hex')}, email_code_expires = ${now() + 15 * 60_000} WHERE id = ${u.id}`;
  await sendMail({ to: u.email, subject: `Business Card Book code: ${code}`, text: `Your verification code is ${code}\n你的驗證碼：${code}\n\nIt expires in 15 minutes. 15 分鐘內有效。` });
  return json({ ok: true });
});

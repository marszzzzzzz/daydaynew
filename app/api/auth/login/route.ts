import { createSession, verifyPassword, type UserRow } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, json, now } from '@/lib/server/http';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export const POST = handler(async (req) => {
  const b = await body(req);
  const name = typeof b.name === 'string' ? b.name.normalize('NFKC').trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const sql = await db();
  const [u] = await sql<UserRow[]>`SELECT * FROM app_user WHERE lower(name) = lower(${name})`;
  const t = now();
  if (u && Number(u.locked_until) > t) {
    const mins = Math.ceil((Number(u.locked_until) - t) / 60_000);
    throw new HttpError(429, `Too many attempts. Try again in ${mins} minutes.`, 'LOCKED', { minutes: mins });
  }
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    if (u) {
      const fails = u.failed_logins + 1;
      await sql`UPDATE app_user SET failed_logins = ${fails >= MAX_FAILS ? 0 : fails}, locked_until = ${fails >= MAX_FAILS ? t + LOCK_MS : 0} WHERE id = ${u.id}`;
    }
    throw new HttpError(401, 'Wrong name or password', 'BAD_LOGIN');
  }
  await sql`UPDATE app_user SET failed_logins = 0, locked_until = 0 WHERE id = ${u.id}`;
  await sql`DELETE FROM app_session WHERE user_id = ${u.id} AND expires_at < ${t}`;
  await createSession(u.id);
  return json({ ok: true });
});

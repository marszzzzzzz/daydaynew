import { createHash, timingSafeEqual } from 'node:crypto';
import { requireUser } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, json, now } from '@/lib/server/http';

export const POST = handler(async (req) => {
  const u = (await requireUser(req)) as Awaited<ReturnType<typeof requireUser>> & { email_code_hash: string | null; email_code_expires: string | null };
  const b = await body(req);
  const code = String(b.code ?? '').replace(/\D/g, '');
  const want = u.email_code_hash;
  const got = createHash('sha256').update(`${u.id}:${code}`).digest('hex');
  if (!want || Number(u.email_code_expires) < now() || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got))) {
    throw new HttpError(400, 'The code is wrong or has expired', 'BAD_CODE');
  }
  const sql = await db();
  await sql`UPDATE app_user SET email_verified_at = ${now()}, email_code_hash = NULL WHERE id = ${u.id}`;
  return json({ ok: true });
});

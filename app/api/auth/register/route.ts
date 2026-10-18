import { checkPassword, cleanName, createSession, hashPassword } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { HttpError, body, handler, id, json, now } from '@/lib/server/http';
import { seedAccount } from '@/lib/server/me';

export const POST = handler(async (req) => {
  const b = await body(req);
  const name = cleanName(b.name);
  const password = checkPassword(b.password);
  const lang = b.lang === 'en' ? 'en' : 'zh';
  const sql = await db();
  const [taken] = await sql`SELECT 1 FROM app_user WHERE lower(name) = lower(${name})`;
  if (taken) throw new HttpError(409, 'That name is taken', 'NAME_TAKEN');
  const uid = id('usr');
  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO app_user (id, name, password_hash, display_name, ui_lang, created_at) VALUES (${uid}, ${name}, ${hash}, ${name}, ${lang}, ${now()})`;
    await seedAccount(tx, uid, lang);
  });
  await createSession(uid);
  return json({ ok: true }, 201);
});

import { validE164 } from '@/lib/phone';
import { checkPassword, endSession, hashPassword, requireUser, toUser, verifyPassword } from '@/lib/server/auth';
import { deletePhotos } from '@/lib/server/blob';
import { db } from '@/lib/server/db';
import { HttpError, body, email, handler, json, longText, text } from '@/lib/server/http';
import { mailEnabled } from '@/lib/server/mail';

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const sql = await db();
  const [s] = await sql<{ contacts: number; drafts: number; due: number }[]>`
    SELECT (SELECT count(*)::int FROM contact WHERE user_id = ${u.id} AND NOT archived) AS contacts,
           (SELECT count(*)::int FROM message WHERE user_id = ${u.id} AND status IN ('DRAFT', 'OPENED', 'FAILED')) AS drafts,
           (SELECT count(*)::int FROM contact WHERE user_id = ${u.id} AND NOT archived AND follow_up_on <= (now() AT TIME ZONE 'Asia/Hong_Kong')::date) AS due`;
  return json({ user: toUser(u), stats: s, mail: { enabled: mailEnabled() } });
});

export const PATCH = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const set: Record<string, unknown> = {};
  if ('displayName' in b) set.display_name = text(b.displayName, 60, 'displayName');
  if ('whatsapp' in b) {
    const w = text(b.whatsapp, 16, 'whatsapp');
    if (w && !validE164(w)) throw new HttpError(400, 'Not a valid WhatsApp number', 'BAD_PHONE');
    set.whatsapp = w || null;
  }
  if ('email' in b) {
    const e = email(b.email);
    if ((e || null) !== u.email) { set.email = e || null; set.email_verified_at = null; set.email_code_hash = null; }
  }
  if ('signature' in b) set.signature = longText(b.signature, 500, 'signature');
  if ('defaultCountry' in b) {
    const c = text(b.defaultCountry, 4, 'defaultCountry');
    if (!/^[1-9]\d{0,3}$/.test(c)) throw new HttpError(400, 'Bad country code', 'BAD_REQUEST');
    set.default_country = c;
  }
  if ('uiLang' in b) set.ui_lang = b.uiLang === 'en' ? 'en' : 'zh';
  if ('myTitle' in b) set.my_title = text(b.myTitle, 120, 'myTitle');
  if ('myCompany' in b) set.my_company = text(b.myCompany, 160, 'myCompany');
  if ('myWebsite' in b) set.my_website = text(b.myWebsite, 200, 'myWebsite');
  if ('myAddress' in b) set.my_address = longText(b.myAddress, 300, 'myAddress');
  if ('newPassword' in b) {
    if (!(await verifyPassword(String(b.currentPassword ?? ''), u.password_hash))) throw new HttpError(400, 'Current password is wrong', 'BAD_PASSWORD');
    set.password_hash = await hashPassword(checkPassword(b.newPassword));
  }
  const sql = await db();
  if (Object.keys(set).length) await sql`UPDATE app_user SET ${sql(set as unknown as Record<string, string>)} WHERE id = ${u.id}`;
  const [fresh] = await sql`SELECT * FROM app_user WHERE id = ${u.id}`;
  return json({ user: toUser(fresh as never) });
});

/** Delete the account and everything in it (spec §9). */
export const DELETE = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  if (!(await verifyPassword(String(b.password ?? ''), u.password_hash))) throw new HttpError(400, 'Password is wrong', 'BAD_PASSWORD');
  const sql = await db();
  const photos = await sql<{ blob_path: string }[]>`SELECT ph.blob_path FROM contact_photo ph JOIN contact c ON c.id = ph.contact_id WHERE c.user_id = ${u.id}`;
  await sql`DELETE FROM app_user WHERE id = ${u.id}`;
  await deletePhotos(photos.map((p) => p.blob_path));
  await endSession();
  return json({ ok: true });
});

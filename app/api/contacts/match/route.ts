import { requireUser } from '@/lib/server/auth';
import { matchContacts } from '@/lib/server/contacts';
import { body, handler, json } from '@/lib/server/http';

/** Existing contacts with any of these phones / e-mails — the "possible duplicate" hint while reviewing a scan. */
export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body<{ phones?: unknown; emails?: unknown; exclude?: unknown }>(req);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : []);
  return json({ contacts: await matchContacts(u.id, list(b.phones), list(b.emails), typeof b.exclude === 'string' ? b.exclude : undefined) });
});

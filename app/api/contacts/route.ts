import { requireUser } from '@/lib/server/auth';
import { createContact, listContacts } from '@/lib/server/contacts';
import { body, handler, json } from '@/lib/server/http';

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const p = req.nextUrl.searchParams;
  const on = (k: string) => p.get(k) === '1' || p.get(k) === 'true';
  const r = await listContacts(u.id, {
    q: p.get('q')?.trim() || undefined,
    tags: p.get('tag')?.split(',').filter(Boolean),
    incomplete: on('incomplete'), starred: on('starred'), wa: on('wa'), hasEmail: on('email'), due: on('due'), archived: on('archived'),
    sort: p.get('sort') ?? undefined,
    offset: Number(p.get('cursor') ?? 0) || 0,
    limit: Math.min(Number(p.get('limit') ?? 50) || 50, 5000),
  });
  return json(r);
});

export const POST = handler(async (req) => {
  const u = await requireUser(req);
  return json(await createContact(u.id, await body(req)), 201);
});

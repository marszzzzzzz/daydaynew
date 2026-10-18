import { requireUser } from '@/lib/server/auth';
import { deleteContacts, getContact, updateContact } from '@/lib/server/contacts';
import { body, handler, json } from '@/lib/server/http';

type P = { id: string };

export const GET = handler<P>(async (req, { id }) => json(await getContact((await requireUser(req)).id, id)));

export const PATCH = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  return json(await updateContact(u.id, id, await body(req)));
});

export const DELETE = handler<P>(async (req, { id }) => {
  const u = await requireUser(req);
  await getContact(u.id, id);
  await deleteContacts(u.id, [id]);
  return json({ ok: true });
});

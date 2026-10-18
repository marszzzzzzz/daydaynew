import { requireUser } from '@/lib/server/auth';
import { mergeContacts } from '@/lib/server/contacts';
import { HttpError, body, handler, json } from '@/lib/server/http';

export const POST = handler(async (req) => {
  const u = await requireUser(req);
  const b = await body<{ keepId?: unknown; mergeIds?: unknown; fields?: unknown }>(req);
  if (typeof b.keepId !== 'string' || !Array.isArray(b.mergeIds) || b.mergeIds.length > 20) throw new HttpError(400, 'keepId and mergeIds[] required', 'BAD_REQUEST');
  const fields = b.fields && typeof b.fields === 'object' ? (b.fields as Record<string, unknown>) : {};
  for (const k of ['phones', 'emails', 'tagIds']) delete fields[k];
  return json(await mergeContacts(u.id, b.keepId, b.mergeIds.map(String), fields));
});

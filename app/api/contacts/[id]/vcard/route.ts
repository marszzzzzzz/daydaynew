import { requireUser } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { handler } from '@/lib/server/http';
import { toVCard, vcfName } from '@/lib/vcard';

export const GET = handler<{ id: string }>(async (req, { id }) => {
  const c = await getContact((await requireUser(req)).id, id);
  return new Response(toVCard(c), {
    headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(vcfName(c))}`, 'cache-control': 'no-store' },
  });
});

import { requireUser } from '@/lib/server/auth';
import { handler } from '@/lib/server/http';
import { myCard } from '@/lib/server/me';
import { toVCard, vcfName } from '@/lib/vcard';

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const card = myCard(u);
  return new Response(toVCard(card), {
    headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(vcfName(card))}`, 'cache-control': 'no-store' },
  });
});

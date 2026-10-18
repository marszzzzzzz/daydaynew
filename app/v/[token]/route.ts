// Public: a share link returns one vCard and nothing else; expired or revoked links are 404 (spec §7.3).
import type { NextRequest } from 'next/server';
import type { UserRow } from '@/lib/server/auth';
import { getContact } from '@/lib/server/contacts';
import { db } from '@/lib/server/db';
import { myCard } from '@/lib/server/me';
import { toVCard, vcfName } from '@/lib/vcard';

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return notFound();
  try {
    const sql = await db();
    const [link] = await sql<{ user_id: string; contact_id: string | null }[]>`
      UPDATE share_link SET views = views + 1 WHERE token = ${token} AND NOT revoked AND expires_at > ${Date.now()} RETURNING user_id, contact_id`;
    if (!link) return notFound();
    let card;
    if (link.contact_id) card = await getContact(link.user_id, link.contact_id);
    else {
      const [u] = await sql<UserRow[]>`SELECT * FROM app_user WHERE id = ${link.user_id}`;
      if (!u) return notFound();
      card = myCard(u);
    }
    return new Response(toVCard(card), {
      headers: {
        'content-type': 'text/vcard; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(vcfName(card))}`,
        'cache-control': 'no-store', 'x-robots-tag': 'noindex',
      },
    });
  } catch {
    return notFound();
  }
}

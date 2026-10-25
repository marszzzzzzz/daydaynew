// POST { id, q? } → { url, signed }. Makes a share link for a card the caller can see: one of their own
// records, or a market listing (found with the ?q= name hint, else among the newest 200). The summary in
// the link comes from Card Pool here, so a link can't claim a price the card doesn't have.
import { NextResponse, type NextRequest } from 'next/server';
import { coverSide } from '@/lib/cards';
import { splitNotes } from '@/lib/meta';
import { SESSION_COOKIE, UPSTREAM, isSameOrigin } from '@/lib/session';
import { signShare, type SharePayload } from '@/lib/share';
import { hashKey, hasFile, putFile, sniffImage } from '@/lib/store';
import type { Listing, PhotoSide, RealCard } from '@/lib/types';

export const dynamic = 'force-dynamic';

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });
const detail = (c: { setName: string; number: string; grade: string }) => [c.setName, c.number, c.grade].filter(Boolean).join(' · ');

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return fail(403, 'Cross-site request refused', 'CSRF');
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return fail(401, 'Sign in first', 'UNAUTHENTICATED');
  let body: { id?: unknown; q?: unknown };
  try { body = await req.json(); } catch { return fail(400, 'Bad request', 'BAD_REQUEST'); }
  const id = String(body.id ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return fail(400, 'Bad request', 'BAD_REQUEST');
  const q = typeof body.q === 'string' ? body.q.slice(0, 60) : '';

  const get = async <T,>(path: string): Promise<T | null> => {
    const res = await fetch(`${UPSTREAM}/api/${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  };
  // The cover photo, copied to the public share store so link previews can show it. The caller can
  // already see it (their own card, or a listing every member sees); a copy is kept only for shared cards.
  const copyPhoto = async (sides: PhotoSide[]): Promise<string | undefined> => {
    if (!sides.length) return undefined;
    try {
    const res = await fetch(`${UPSTREAM}/api/real-cards/${encodeURIComponent(id)}/photos/${coverSide(sides).toLowerCase()}`,
      { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return undefined;
    const data = new Uint8Array(await res.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind || data.byteLength > 6 * 1024 * 1024) return undefined;
    const key = `share/${id}/${hashKey(data)}.${kind.ext}`;
    if (!(await hasFile(key))) await putFile(key, data, kind.type, 31536000);
    return key;
    } catch (e) {
      console.error('[share] photo copy failed', e); // the link still works, just without the photo
      return undefined;
    }
  };

  let p: SharePayload | null = null;
  try {
    const mine = await get<RealCard[] | { cards: RealCard[] }>('real-cards');
    const own = (Array.isArray(mine) ? mine : mine?.cards ?? []).find((c) => c.id === id);
    if (own) {
      const meta = splitNotes(own.notes);
      const me = await get<{ user: { name: string } }>('me');
      p = { v: 1, id, n: own.name, d: detail(own), p: own.askingPrice, c: own.currency, s: me?.user.name ?? '', cat: own.category?.name ?? '', g: meta.tags, sn: meta.serial, l: own.marketPublic,
        ci: own.category?.id, ph: await copyPhoto(own.photos.map((x) => x.side)) };
    } else {
      for (const path of [q ? `real-market?q=${encodeURIComponent(q)}` : null, 'real-market']) {
        if (!path) continue;
        const l = (await get<Listing[]>(path))?.find((x) => x.id === id);
        if (l) {
          p = { v: 1, id, n: l.name, d: detail(l), p: l.askingPrice, c: l.currency, s: l.seller.name, cat: l.category?.name ?? '', g: [], sn: '', l: true,
            ci: l.category?.id, ph: await copyPhoto(l.photos) };
          break;
        }
      }
    }
  } catch {
    return fail(502, 'Card Pool is not reachable — please try again shortly', 'UPSTREAM_UNAVAILABLE');
  }
  if (!p) return fail(404, 'Card not found', 'NOT_FOUND');

  const origin = req.nextUrl.origin;
  const t = signShare(p);
  return NextResponse.json({ url: `${origin}/c/${encodeURIComponent(id)}${t ? `?t=${t}` : ''}`, signed: !!t });
}

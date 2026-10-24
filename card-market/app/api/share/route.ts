// POST { id, q? } → { url, signed }. Makes a share link for a card the caller can see: one of their own
// records, or a market listing (found with the ?q= name hint, else among the newest 200). The summary in
// the link comes from Card Pool here, so a link can't claim a price the card doesn't have.
import { NextResponse, type NextRequest } from 'next/server';
import { splitNotes } from '@/lib/meta';
import { SESSION_COOKIE, UPSTREAM, isSameOrigin } from '@/lib/session';
import { signShare, type SharePayload } from '@/lib/share';
import type { Listing, RealCard } from '@/lib/types';

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
  let p: SharePayload | null = null;
  try {
    const mine = await get<RealCard[] | { cards: RealCard[] }>('real-cards');
    const own = (Array.isArray(mine) ? mine : mine?.cards ?? []).find((c) => c.id === id);
    if (own) {
      const meta = splitNotes(own.notes);
      const me = await get<{ user: { name: string } }>('me');
      p = { v: 1, id, n: own.name, d: detail(own), p: own.askingPrice, c: own.currency, s: me?.user.name ?? '', cat: own.category?.name ?? '', g: meta.tags, sn: meta.serial, l: own.marketPublic };
    } else {
      for (const path of [q ? `real-market?q=${encodeURIComponent(q)}` : null, 'real-market']) {
        if (!path) continue;
        const l = (await get<Listing[]>(path))?.find((x) => x.id === id);
        if (l) { p = { v: 1, id, n: l.name, d: detail(l), p: l.askingPrice, c: l.currency, s: l.seller.name, cat: l.category?.name ?? '', g: [], sn: '', l: true }; break; }
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

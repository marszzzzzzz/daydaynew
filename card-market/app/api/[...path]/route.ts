// Same-origin proxy to the Card Pool API (the backend sends no CORS headers — spec §10.2).
// - Only the account, real-card and player-market routes are forwarded (no game, no admin).
// - The session token is kept in an httpOnly cookie and sent upstream as a bearer token.
// - Login / register responses have their token swapped for that cookie.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, UPSTREAM, clearSession, isSameOrigin, setSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ALLOWED = /^(config|me|me\/whatsapp|auth\/(login|register|password|name-available)|real-cards(\/.*)?|real-market(\/.*)?)$/;
const TOKEN_ROUTES = new Set(['auth/login', 'auth/register']);
const PASS_HEADERS = ['content-type', 'cache-control', 'retry-after'];

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const sub = path.join('/');
  if (!ALLOWED.test(sub) || path.some((p) => p === '..' || p === '.')) return fail(404, 'Not found', 'NOT_FOUND');
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  if (write && !isSameOrigin(req)) return fail(403, 'Cross-site request refused', 'CSRF');

  const headers = new Headers({ accept: req.headers.get('accept') ?? 'application/json' });
  const type = req.headers.get('content-type');
  if (type) headers.set('content-type', type);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) headers.set('authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${UPSTREAM}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: write ? await req.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return fail(502, 'Card Pool is not reachable — please try again shortly', 'UPSTREAM_UNAVAILABLE');
  }

  // Sign-in: keep the token server-side.
  if (TOKEN_ROUTES.has(sub) && res.ok) {
    let data: { token?: string };
    try {
      data = await res.json();
    } catch {
      return fail(502, 'Card Pool sent an unexpected reply', 'UPSTREAM_UNAVAILABLE');
    }
    const { token: newToken, ...rest } = data;
    const out = NextResponse.json(rest);
    if (newToken) setSession(out, newToken);
    return out;
  }

  const out = new NextResponse(req.method === 'HEAD' ? null : res.body, { status: res.status });
  for (const h of PASS_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  // The backend no longer knows this session (signed out everywhere, or account reset): forget it.
  if (res.status === 401 && token && !TOKEN_ROUTES.has(sub)) clearSession(out);
  return out;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };

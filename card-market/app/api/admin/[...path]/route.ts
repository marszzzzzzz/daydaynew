// Admin area proxy. The caller must be signed in with an account listed in CARD_MARKET_ADMINS; their
// request is then made to Card Pool's admin API with this server's admin session (lib/admin.ts).
// Only the market and account-moderation routes below are forwarded.
import { NextResponse, type NextRequest } from 'next/server';
import { adminConfigured, adminFetch, caller, isAdmin } from '@/lib/admin';
import { SESSION_COOKIE, isSameOrigin } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ID = '[A-Za-z0-9_-]{1,64}';
const READ = new RegExp(`^(real-market|real-market/deals/${ID}|real-cards/${ID}/photos/(front|back)|players|players/${ID})$`);
const WRITE = new RegExp(`^(real-market/${ID}/(remove|restore)|real-market/deals/${ID}/cancel|players/${ID}/(suspend|unsuspend|sign-out|unlock))$`);
const PASS_HEADERS = ['content-type', 'cache-control'];

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const sub = path.join('/');
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  if (write && !isSameOrigin(req)) return fail(403, 'Cross-site request refused', 'CSRF');

  const who = await caller(req.cookies.get(SESSION_COOKIE)?.value);
  if (sub === 'session' && req.method === 'GET') {
    // What the page needs to decide what to show: never the admin list itself.
    return NextResponse.json({ signedIn: !!who, admin: isAdmin(who), configured: adminConfigured(), id: who?.id ?? null, name: who?.name ?? null });
  }
  if (!who) return fail(401, 'Sign in first', 'UNAUTHENTICATED');
  if (!isAdmin(who)) return fail(403, 'This account is not an admin', 'NOT_ADMIN');
  if (!adminConfigured()) return fail(503, 'Admin access is not set up on this site', 'ADMIN_NOT_CONFIGURED');
  if (!(write ? WRITE : READ).test(sub) || (write && req.method !== 'POST')) return fail(404, 'Not found', 'NOT_FOUND');

  let res: Response;
  try {
    // A reason or note sent with the action says which admin did it (Card Pool sees one shared admin).
    let body: ArrayBuffer | undefined;
    if (write) {
      const raw = await req.text();
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { return fail(400, 'Bad request', 'BAD_REQUEST'); }
      for (const k of ['reason', 'note'] as const) {
        if (typeof data[k] === 'string' && data[k]) data[k] = `${String(data[k]).slice(0, 400)} — ${who.name}`;
      }
      body = new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer;
      console.info(`[admin] ${who.name} (${who.id}) POST ${sub}`);
    }
    res = await adminFetch(`${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`, { method: req.method, body, type: write ? 'application/json' : null });
  } catch (e) {
    console.error('[admin] upstream', e);
    return fail(502, 'Card Pool admin is not reachable — check CARD_POOL_ADMIN_PASSWORD', 'UPSTREAM_UNAVAILABLE');
  }
  const out = new NextResponse(req.method === 'HEAD' ? null : res.body, { status: res.status });
  for (const h of PASS_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  if (!res.headers.get('cache-control')) out.headers.set('cache-control', 'private, no-store');
  return out;
}

export { handler as GET, handler as POST };

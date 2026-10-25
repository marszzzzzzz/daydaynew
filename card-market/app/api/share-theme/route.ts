// Share backgrounds. GET ?category=<id> (anyone): the background to draw for that category.
// GET ?config=1 and PUT (admins): the full settings — one background for all cards, plus per category.
import { NextResponse, type NextRequest } from 'next/server';
import { adminCaller } from '@/lib/admin';
import { SESSION_COOKIE, isSameOrigin } from '@/lib/session';
import { resolveBg } from '@/lib/theme';
import { parseTheme, readTheme, saveTheme } from '@/lib/theme-server';

export const dynamic = 'force-dynamic';
const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });

export async function GET(req: NextRequest) {
  const cfg = await readTheme();
  if (req.nextUrl.searchParams.get('config') === '1') {
    if (!(await adminCaller(req.cookies.get(SESSION_COOKIE)?.value))) return fail(403, 'This account is not an admin', 'NOT_ADMIN');
    return NextResponse.json(cfg, { headers: { 'cache-control': 'private, no-store' } });
  }
  return NextResponse.json(resolveBg(cfg, req.nextUrl.searchParams.get('category')), { headers: { 'cache-control': 'public, max-age=30' } });
}

export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) return fail(403, 'Cross-site request refused', 'CSRF');
  const who = await adminCaller(req.cookies.get(SESSION_COOKIE)?.value);
  if (!who) return fail(403, 'This account is not an admin', 'NOT_ADMIN');
  let cfg;
  try { cfg = parseTheme(await req.json()); } catch { cfg = null; }
  if (!cfg) return fail(400, 'Invalid background settings', 'BAD_REQUEST');
  await saveTheme(cfg);
  console.info(`[admin] ${who.name} (${who.id}) saved share backgrounds`);
  return NextResponse.json(cfg);
}

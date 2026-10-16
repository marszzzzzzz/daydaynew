// Server-only session helpers. The Card Pool bearer token lives in an httpOnly cookie on this
// site, so page scripts never see it; the /api proxy turns it back into an Authorization header.
import type { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'cm_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days; the backend session itself does not expire

/** Card Pool backend this app forwards /api/* to (spec §10.2 option b). */
export const UPSTREAM = (process.env.CARD_POOL_API_URL || 'https://daydaynew-card-pool.vercel.app').replace(/\/+$/, '');

export function setSession(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/**
 * CSRF guard for cookie-authenticated writes: the request must come from this site.
 * Browsers always send Origin on cross-origin and on same-origin non-GET fetches.
 */
export function isSameOrigin(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  if (!origin) return site === 'same-origin';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

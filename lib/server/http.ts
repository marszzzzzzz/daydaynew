// Route-handler plumbing: JSON errors ({ error, code }), same-origin checks for writes (spec §9), input cleaning.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public data?: unknown) { super(message); }
}

export const json = (data: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });

/** Writes must come from this site: Sec-Fetch-Site same-origin, or an Origin matching the host. */
export function checkOrigin(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request refused', 'CSRF');
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    try { if (new URL(origin).host !== host) throw new Error(); } catch { throw new HttpError(403, 'Cross-site request refused', 'CSRF'); }
  }
}

type Ctx<P> = { params: Promise<P> };
/** Wrap a handler: origin check, HttpError → JSON, unexpected errors → 500 (logged). */
export function handler<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      checkOrigin(req);
      return await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code, data: e.data }, e.status);
      const pg = e as { code?: string; message?: string };
      if (pg?.code === '23505') return json({ error: 'Already exists', code: 'DUPLICATE' }, 409);
      console.error(e);
      return json({ error: 'Server error', code: 'SERVER_ERROR' }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object') throw new Error();
    return b as T;
  } catch { throw new HttpError(400, 'Invalid JSON body', 'BAD_REQUEST'); }
}

/** NFKC, trimmed, length-capped text; refuses pasted base64 images (spec §9). */
export function text(v: unknown, max: number, field = 'text'): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${field} must be text`, 'BAD_REQUEST');
  const s = String(v).normalize('NFKC').replace(/\u0000/g, '').trim();
  if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(s) || /[A-Za-z0-9+/]{400,}={0,2}/.test(s)) throw new HttpError(400, `${field}: embedded files are not allowed`, 'BAD_REQUEST');
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max})`, 'TOO_LONG', { field, max });
  return s;
}

/** Multi-line text keeps its line breaks (NFKC per line). */
export const longText = (v: unknown, max: number, field = 'text') => text(typeof v === 'string' ? v.replace(/\r\n/g, '\n') : v, max, field);

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;
export function email(v: unknown, field = 'email'): string {
  const s = text(v, 254, field).toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw new HttpError(400, `${field} is not a valid e-mail address`, 'BAD_EMAIL');
  return s;
}

export function date(v: unknown, field = 'date'): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${field} must be YYYY-MM-DD`, 'BAD_DATE');
  return v;
}

export const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;
export const now = () => Date.now();

/** The site's public base URL (APP_URL, else the production domain, else this request's origin). */
export function baseUrl(req: NextRequest) {
  const env = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (env) return env.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

// Admins upload a share background picture (JPEG / PNG / WebP, ≤ 4 MB, checked by its bytes).
// Returns its key, to be chosen in the settings with PUT /api/share-theme.
import { NextResponse, type NextRequest } from 'next/server';
import { adminCaller } from '@/lib/admin';
import { SESSION_COOKIE, isSameOrigin } from '@/lib/session';
import { hashKey, hasFile, putFile, sniffImage } from '@/lib/store';

export const dynamic = 'force-dynamic';
const MAX = 4 * 1024 * 1024;
const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status });

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return fail(403, 'Cross-site request refused', 'CSRF');
  const who = await adminCaller(req.cookies.get(SESSION_COOKIE)?.value);
  if (!who) return fail(403, 'This account is not an admin', 'NOT_ADMIN');
  if (Number(req.headers.get('content-length') ?? 0) > MAX) return fail(413, 'Picture is too large (max 4 MB)', 'TOO_LARGE');
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX) return fail(413, 'Picture is too large (max 4 MB)', 'TOO_LARGE');
  const kind = sniffImage(data);
  if (!kind) return fail(400, 'Use a JPEG, PNG or WebP picture', 'PHOTO_UNREADABLE');
  const key = `theme/${hashKey(data)}.${kind.ext}`;
  if (!(await hasFile(key))) await putFile(key, data, kind.type, 31536000);
  console.info(`[admin] ${who.name} (${who.id}) uploaded share background ${key}`);
  return NextResponse.json({ key });
}

// Sign out on this device: drop the session cookie.
import { NextResponse, type NextRequest } from 'next/server';
import { clearSession, isSameOrigin } from '@/lib/session';

export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused', code: 'CSRF' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}

// Public images for sharing: copies of shared card photos and the share backgrounds (lib/store.ts).
// Keys hold a content hash, so a file never changes and can be cached for a year.
import { NextResponse } from 'next/server';
import { KEY, getFile } from '@/lib/store';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!KEY.test(key) || key.startsWith('config/')) return new NextResponse('Not found', { status: 404 });
  const f = await getFile(key);
  if (!f) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(f.body, { headers: { 'content-type': f.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

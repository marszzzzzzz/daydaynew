import { hasPhotoStore } from '@/lib/server/blob';
import { db, hasDatabase } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { mailEnabled } from '@/lib/server/mail';

export const dynamic = 'force-dynamic';

/** What is connected: database, photo store, system e-mail. */
export async function GET() {
  let database: 'ok' | 'missing' | 'error' = hasDatabase() ? 'ok' : 'missing';
  if (database === 'ok') {
    try { const sql = await db(); await sql`SELECT 1`; } catch (e) { console.error(e); database = 'error'; }
  }
  return json({ database, photos: hasPhotoStore() ? 'ok' : 'missing', mail: mailEnabled() ? 'ok' : 'off' });
}

import { endSession } from '@/lib/server/auth';
import { handler, json } from '@/lib/server/http';

export const POST = handler(async () => {
  await endSession();
  return json({ ok: true });
});

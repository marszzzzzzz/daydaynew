import { requireUser } from '@/lib/server/auth';
import { findDuplicates } from '@/lib/server/contacts';
import { handler, json } from '@/lib/server/http';

export const GET = handler(async (req) => json({ groups: await findDuplicates((await requireUser(req)).id) }));

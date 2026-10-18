import { requireUser } from '@/lib/server/auth';
import { listContacts } from '@/lib/server/contacts';
import { handler } from '@/lib/server/http';
import { toVCard } from '@/lib/vcard';
import type { Contact } from '@/lib/types';

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function csv(rows: Contact[]) {
  const head = ['Name (zh)', 'Name (en)', 'Title', 'Title (en)', 'Company', 'Company (en)', 'Department', 'Mobile', 'Office', 'Fax', 'WhatsApp', 'Other phones', 'Email', 'Other emails', 'Website', 'Address', 'Tags', 'Met at', 'Met on', 'Follow up on', 'Starred', 'Notes'];
  const lines = rows.map((c) => {
    const of = (k: string) => c.phones.filter((p) => p.kind === k).map((p) => p.e164);
    return [c.nameZh, c.nameEn, c.title, c.titleEn, c.company, c.companyEn, c.department, of('MOBILE')[0] ?? '', of('OFFICE')[0] ?? '', of('FAX')[0] ?? '',
      c.phones.find((p) => p.whatsapp)?.e164 ?? '', c.phones.slice(1).map((p) => p.e164).join(' '), c.emails[0]?.email ?? '', c.emails.slice(1).map((e) => e.email).join(' '),
      c.website, c.address, c.tags.map((t) => t.name).join(', '), c.metAt, c.metOn, c.followUpOn, c.starred ? 'yes' : '', c.notes].map((v) => cell(String(v ?? ''))).join(',');
  });
  // UTF-8 BOM so Excel opens Chinese text correctly (spec §5).
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
}

export const GET = handler(async (req) => {
  const u = await requireUser(req);
  const p = req.nextUrl.searchParams;
  const ids = p.get('ids')?.split(',').filter(Boolean);
  const { contacts } = await listContacts(u.id, ids?.length ? { ids, limit: 5000, sort: 'name' } : { limit: 5000, sort: 'name' });
  const day = new Date().toISOString().slice(0, 10);
  if (p.get('format') === 'csv') {
    return new Response(csv(contacts), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="contacts-${day}.csv"`, 'cache-control': 'no-store' } });
  }
  return new Response(contacts.map(toVCard).join(''), { headers: { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename="contacts-${day}.vcf"`, 'cache-control': 'no-store' } });
});

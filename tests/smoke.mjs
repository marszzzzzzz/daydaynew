// End-to-end API check against a running server: node tests/smoke.mjs http://localhost:3000
const BASE = process.argv[2] ?? 'http://localhost:3000';
let cookie = '';
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

async function call(method, path, body, raw) {
  const headers = { origin: BASE, cookie };
  let payload;
  if (raw) { payload = raw; headers['content-type'] = 'image/jpeg'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const r = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = r.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await r.json() : await r.text();
  return { status: r.status, data, headers: r.headers };
}

const name = `t${Date.now() % 1e8}`;
let r = await call('POST', '/api/auth/register', { name, password: 'secret123', lang: 'zh' });
ok(r.status === 201, 'register');
r = await call('POST', '/api/auth/register', { name: name.toUpperCase(), password: 'secret123' });
ok(r.status === 409 && r.data.code === 'NAME_TAKEN', 'name taken (case-insensitive)');
r = await call('PATCH', '/api/me', { displayName: '陳大文 Peter Chan', whatsapp: '+85291234567', email: 'me@example.com', myCompany: 'ABC 有限公司 ABC Limited', myTitle: '經理 Manager', signature: '— Peter' });
ok(r.status === 200 && r.data.user.whatsapp === '+85291234567', 'update profile');
r = await call('GET', '/api/me');
ok(r.status === 200 && r.data.stats.contacts === 0, 'me + stats');
r = await call('GET', '/api/tags');
ok(r.data.tags.length === 6, 'default tags');
const tagId = r.data.tags[0].id;
r = await call('GET', '/api/templates');
ok(r.data.templates.length === 8, 'default templates');
const tplId = r.data.templates.find((x) => x.name === '初次認識跟進').id;

r = await call('POST', '/api/contacts', { nameZh: '李小明', nameEn: 'Michael Lee', company: '深圳科技有限公司', title: '總監', metAt: 'HKTDC', metOn: '2026-10-18', followUpOn: '2026-01-01',
  phones: [{ kind: 'MOBILE', e164: '+85298765432', raw: '9876 5432', whatsapp: true }], emails: [{ email: 'Mike@Example.com' }], tagIds: [tagId], source: 'SCAN', ocrText: 'raw text' });
ok(r.status === 201 && r.data.emails[0].email === 'mike@example.com' && r.data.tags.length === 1, 'create contact');
const c1 = r.data.id;
r = await call('POST', '/api/contacts', { nameEn: 'Mike Lee', phones: [{ kind: 'MOBILE', e164: '+85298765432' }] });
const c2 = r.data.id;
ok(r.status === 201, 'create second contact');
r = await call('POST', '/api/contacts', { nameEn: 'Bad', phones: [{ kind: 'MOBILE', e164: '+8521234' }] });
ok(r.status === 400 && r.data.code === 'BAD_PHONE', 'reject bad phone');
r = await call('POST', '/api/contacts', { notes: 'data:image/png;base64,AAAA' });
ok(r.status === 400, 'reject embedded base64');

r = await call('GET', '/api/contacts?q=9876');
ok(r.data.contacts.length === 2, 'search by phone digits');
r = await call('GET', '/api/contacts?q=' + encodeURIComponent('深圳'));
ok(r.data.contacts.length === 1, 'search Chinese company');
r = await call('GET', `/api/contacts?tag=${tagId}`);
ok(r.data.contacts.length === 1, 'filter by tag');
r = await call('GET', '/api/contacts?due=1');
ok(r.data.contacts.length === 1, 'filter follow-up due');
r = await call('POST', '/api/contacts/match', { phones: ['+85298765432'], emails: [] });
ok(r.data.contacts.length === 2, 'match by phone');
r = await call('GET', '/api/contacts/duplicates');
ok(r.data.groups.length === 1 && r.data.groups[0].contacts.length === 2, 'duplicates group');

// photo
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
r = await call('PUT', `/api/contacts/${c2}/photos/front`, undefined, jpeg);
ok(r.status === 200, 'upload photo');
r = await call('PUT', `/api/contacts/${c2}/photos/back`, undefined, Buffer.from('not an image'));
ok(r.status === 415, 'reject non-image');
r = await call('GET', `/api/contacts/${c2}/photos/front`);
ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', 'read photo');

r = await call('POST', '/api/contacts/merge', { keepId: c1, mergeIds: [c2], fields: { nameEn: 'Michael Lee' } });
ok(r.status === 200 && r.data.photos.includes('FRONT') && r.data.phones.length === 1, 'merge (photo moved, phones de-duplicated)');
r = await call('GET', `/api/contacts/${c2}`);
ok(r.status === 404, 'merged contact gone');

r = await call('PATCH', `/api/contacts/${c1}`, { starred: true, emails: [{ email: 'mike@example.com', isPrimary: true }, { email: 'm2@example.com' }] });
ok(r.data.starred && r.data.emails.length === 2 && r.data.nameZh === '李小明', 'patch only given fields');
r = await call('GET', `/api/contacts/${c1}/vcard`);
ok(typeof r.data === 'string' && r.data.includes('FN:李小明 Michael Lee') && r.data.includes('\r\n'), 'vcard');
{ const res = await fetch(`${BASE}/api/contacts/export?format=csv`, { headers: { cookie } }); const buf = Buffer.from(await res.arrayBuffer());
  ok(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf && buf.toString().includes('李小明'), 'csv export with BOM'); }

// messages
r = await call('POST', '/api/messages', { channel: 'WHATSAPP', contactId: c1, templateId: tplId });
ok(r.status === 201 && r.data.toAddress === '+85298765432' && r.data.body.includes('李小明') && r.data.body.includes('HKTDC'), 'draft from template (vars filled)');
const m = r.data;
r = await call('PATCH', `/api/messages/${m.id}`, { body: 'v2', version: m.version });
ok(r.status === 200 && r.data.version === m.version + 1, 'autosave bumps version');
r = await call('PATCH', `/api/messages/${m.id}`, { body: 'stale', version: m.version });
ok(r.status === 409 && r.data.code === 'VERSION_CONFLICT' && r.data.data.body === 'v2', 'stale version → 409 with current copy');
r = await call('POST', `/api/messages/${m.id}/opened`);
ok(r.data.status === 'OPENED', 'opened');
r = await call('POST', `/api/messages/${m.id}/mark-sent`);
ok(r.data.status === 'SENT' && r.data.sentAt, 'mark sent');
r = await call('PATCH', `/api/messages/${m.id}`, { body: 'x', version: r.data.version });
ok(r.status === 409 && r.data.code === 'SENT_LOCKED', 'sent is read-only');
r = await call('POST', `/api/messages/${m.id}/copy`);
ok(r.status === 201 && r.data.status === 'DRAFT' && r.data.body === 'v2', 'copy as new draft');
r = await call('GET', '/api/messages?status=drafts');
ok(r.data.messages.length === 1, 'drafts box');
r = await call('POST', '/api/messages', { channel: 'EMAIL', contactId: c1, subject: 'Hi', body: 'Hello' });
ok(r.data.toAddress === 'mike@example.com', 'email draft picks primary e-mail');
r = await call('POST', `/api/messages/${r.data.id}/send`);
ok(r.status === 503 && r.data.code === 'MAIL_DISABLED', 'system send off without Resend');

// share links
r = await call('POST', '/api/share-links', { contactId: null });
ok(r.status === 201 && r.data.url.includes('/v/'), 'share link (my card)');
const token = r.data.token;
const savedCookie = cookie; cookie = '';
r = await call('GET', `/v/${token}`);
ok(r.status === 200 && r.data.includes('FN:陳大文 Peter Chan') && r.data.includes('ORG:ABC 有限公司') && r.data.includes('TITLE:經理 Manager'), 'public vcard download');
cookie = savedCookie;
await call('DELETE', `/api/share-links/${token}`);
cookie = '';
r = await call('GET', `/v/${token}`);
ok(r.status === 404, 'revoked link → 404');
cookie = savedCookie;

// CSRF
r = await fetch(`${BASE}/api/contacts`, { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
ok(r.status === 403, 'cross-origin write refused');

// bulk + lockout + delete
r = await call('POST', '/api/contacts/bulk', { ids: [c1], action: 'archive' });
ok(r.data.count === 1, 'bulk archive');
r = await call('GET', '/api/contacts?archived=1');
ok(r.data.contacts.length === 1, 'archived filter');
await call('POST', '/api/auth/logout');
for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { name, password: 'wrong' });
r = await call('POST', '/api/auth/login', { name, password: 'secret123' });
ok(r.status === 429 && r.data.code === 'LOCKED', 'locked after 5 failures');
process.exitCode = fails ? 1 : 0;
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');

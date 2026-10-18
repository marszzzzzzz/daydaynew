// The user's own card (spec §7.3 "發送我的名片", §10 /me) and new-account defaults.
import 'server-only';
import { DEFAULT_TEMPLATES, userCard } from '@/lib/template';
import type { VCardInput } from '@/lib/vcard';
import type { UserRow } from './auth';
import type { Tx } from './db';
import { id, now } from './http';

export function myCard(u: UserRow): VCardInput {
  return userCard({ displayName: u.display_name, name: u.name, myTitle: u.my_title, myCompany: u.my_company, myAddress: u.my_address, myWebsite: u.my_website, whatsapp: u.whatsapp, email: u.email });
}
const DEFAULT_TAGS: Record<'zh' | 'en', [string, string][]> = {
  zh: [['客戶', 'blue'], ['供應商', 'amber'], ['潛在客戶', 'green'], ['合作夥伴', 'violet'], ['同業', 'slate'], ['朋友', 'rose']],
  en: [['Client', 'blue'], ['Supplier', 'amber'], ['Prospect', 'green'], ['Partner', 'violet'], ['Peer', 'slate'], ['Friend', 'rose']],
};

export async function seedAccount(tx: Tx, userId: string, lang: 'zh' | 'en') {
  for (const [name, color] of DEFAULT_TAGS[lang]) await tx`INSERT INTO tag (id, user_id, name, color) VALUES (${id('tag')}, ${userId}, ${name}, ${color})`;
  const t = now();
  for (const [i, tp] of DEFAULT_TEMPLATES.entries()) {
    await tx`INSERT INTO template (id, user_id, channel, name, subject, body, created_at, updated_at) VALUES (${id('tpl')}, ${userId}, ${tp.channel}, ${tp.name}, ${tp.subject}, ${tp.body}, ${t + i}, ${t + i})`;
  }
}

// Starting a message from anywhere in the app: create the draft, then open it in the editor.
'use client';
import { api } from './api';
import { cardText, userCard } from './template';
import type { Channel, Contact, Message, ShareLink, User } from './types';

export interface DraftInput { channel: Channel; contactId?: string | null; toAddress?: string; templateId?: string | null; subject?: string; body?: string; attachVcardOf?: string | null; attachMyCard?: boolean }

export const createDraft = (d: DraftInput) => api<Message>('messages', { body: { ...d } });

export const shareLink = (contactId: string | null) => api<Pick<ShareLink, 'token' | 'url' | 'expiresAt'>>('share-links', { body: { contactId } });

/**
 * "Send this contact's details" / "Send my card" (spec §7.3): the text card, plus (optionally) a 7-day link that
 * adds the vCard to the phone's address book. E-mail drafts attach the vCard file instead.
 */
export async function cardDraft(opts: { channel: Channel; of: Contact | null; me: User; withLink: boolean; linkLabel: string; intro?: string; to?: { contactId?: string; toAddress?: string } }) {
  const text = cardText(opts.of ?? userCard(opts.me));
  let body = [opts.intro, text].filter(Boolean).join('\n\n');
  if (opts.channel === 'WHATSAPP' && opts.withLink) {
    const l = await shareLink(opts.of?.id ?? null);
    body += `\n\n${opts.linkLabel}${l.url}`;
  }
  const subject = opts.channel === 'EMAIL' ? (opts.of ? [opts.of.nameZh, opts.of.nameEn].filter(Boolean).join(' ') : opts.me.displayName || opts.me.name) : '';
  return createDraft({
    channel: opts.channel, body, subject, contactId: opts.to?.contactId ?? null, toAddress: opts.to?.toAddress ?? '',
    attachVcardOf: opts.channel === 'EMAIL' && opts.of ? opts.of.id : null, attachMyCard: opts.channel === 'EMAIL' && !opts.of,
  });
}

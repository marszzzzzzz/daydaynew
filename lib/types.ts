// Shapes shared by the browser and the API (camelCase JSON; the database uses snake_case).
export type CardLanguage = 'en' | 'zh' | 'ja' | 'ko' | 'other';
export type PhotoSide = 'FRONT' | 'BACK';
export type PhoneKind = 'MOBILE' | 'OFFICE' | 'FAX' | 'OTHER';
export type Channel = 'WHATSAPP' | 'EMAIL';
export type MessageStatus = 'DRAFT' | 'OPENED' | 'SENT' | 'FAILED';
export type ContactSource = 'SCAN' | 'MANUAL' | 'IMPORT';

export interface Phone { kind: PhoneKind; e164: string; raw: string; whatsapp: boolean; isPrimary: boolean }
export interface Email { email: string; isPrimary: boolean }
export interface Tag { id: string; name: string; color: string; count?: number }

/** The editable fields of a contact (what forms hold and what POST / PATCH send). */
export interface ContactFields {
  nameZh: string; nameEn: string; title: string; titleEn: string; company: string; companyEn: string;
  department: string; address: string; website: string; notes: string; metAt: string;
  metOn: string; followUpOn: string; // 'YYYY-MM-DD' or ''
  starred: boolean; language: CardLanguage;
  phones: Phone[]; emails: Email[]; tagIds: string[];
}

export interface Contact extends ContactFields {
  id: string; ocrText: string; source: ContactSource; archived: boolean;
  photos: PhotoSide[]; photoV: number; tags: Tag[]; createdAt: number; updatedAt: number;
}

export interface User {
  id: string; name: string; displayName: string; whatsapp: string | null; email: string | null; emailVerified: boolean;
  signature: string; defaultCountry: string; uiLang: 'zh' | 'en';
  myTitle: string; myCompany: string; myWebsite: string; myAddress: string;
}

export interface Me { user: User; stats: { contacts: number; drafts: number; due: number }; mail: { enabled: boolean } }

export interface Template { id: string; channel: Channel; name: string; subject: string; body: string; updatedAt: number }

export interface Message {
  id: string; channel: Channel; status: MessageStatus; contactId: string | null; contactName: string | null;
  toAddress: string; subject: string; body: string; attachVcardOf: string | null; attachMyCard: boolean;
  templateId: string | null; error: string | null; version: number; createdAt: number; updatedAt: number; sentAt: number | null;
}

export interface ShareLink { token: string; contactId: string | null; contactName: string | null; url: string; expiresAt: number; revoked: boolean; views: number }

export const TAG_COLORS = ['slate', 'blue', 'green', 'amber', 'rose', 'violet', 'teal', 'orange'] as readonly string[];

export const emptyContact = (): ContactFields => ({
  nameZh: '', nameEn: '', title: '', titleEn: '', company: '', companyEn: '', department: '', address: '', website: '',
  notes: '', metAt: '', metOn: '', followUpOn: '', starred: false, language: 'en', phones: [], emails: [], tagIds: [],
});

/** The name to show: Chinese when there is one, else English. */
export const displayName = (c: { nameZh: string; nameEn: string }) => c.nameZh || c.nameEn;
export const fullName = (c: { nameZh: string; nameEn: string }) => [c.nameZh, c.nameEn].filter(Boolean).join(' ');
export const displayCompany = (c: { company: string; companyEn: string }) => c.company || c.companyEn;
export const displayTitle = (c: { title: string; titleEn: string }) => c.title || c.titleEn;

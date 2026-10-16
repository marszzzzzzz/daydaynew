import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { LangProvider, type Lang } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '日日新卡市 · Card Market', template: '%s · 日日新卡市' },
  description: 'List your real trading cards, get offers from other collectors and close the deal in person over WhatsApp.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f1d' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang: Lang = (await cookies()).get('cm_lang')?.value === 'en' ? 'en' : 'zh';
  return (
    <html lang={lang === 'zh' ? 'zh-Hant-HK' : 'en'}>
      <body>
        <LangProvider initial={lang}>
          <Shell>{children}</Shell>
        </LangProvider>
      </body>
    </html>
  );
}

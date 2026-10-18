import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { LangProvider } from '@/lib/i18n';
import { pickLang } from '@/lib/lang';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '名片簿 · Business Card Book', template: '%s · 名片簿' },
  description: 'Scan business cards, keep them organised, and reach people on WhatsApp or e-mail.',
  robots: { index: false },
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
  const lang = pickLang((await cookies()).get('bc_lang')?.value, (await headers()).get('accept-language'));
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

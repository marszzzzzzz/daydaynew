import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, Noto_Sans_TC } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { LangProvider } from '@/lib/i18n';
import { pickLang } from '@/lib/lang';
import './globals.css';

// Display: Archivo, heavy and slightly wide. Body: Inter. Chinese: Noto Sans TC (not preloaded: it is large
// and the browser only fetches the slices a page uses).
const head = Archivo({ subsets: ['latin'], weight: ['700', '800', '900'], variable: '--font-head', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const tc = Noto_Sans_TC({ weight: ['400', '500', '900'], variable: '--font-tc', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: { default: '日日新卡市 · Card Market', template: '%s · 日日新卡市' },
  description: 'List your real trading cards, get offers from other collectors and close the deal in person over WhatsApp.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0c',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = pickLang((await cookies()).get('cm_lang')?.value, (await headers()).get('accept-language'));
  return (
    <html lang={lang === 'zh' ? 'zh-Hant-HK' : 'en'} className={`${head.variable} ${body.variable} ${tc.variable}`}>
      <body>
        <LangProvider initial={lang}>
          <Shell>{children}</Shell>
        </LangProvider>
      </body>
    </html>
  );
}

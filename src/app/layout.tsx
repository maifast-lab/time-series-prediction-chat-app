import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import Providers from '@/app/providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001'),
  title: 'Maifast',
  description: 'An AI chat and spreadsheet workspace.',
  icons: {
    icon: '/PNG.png',
  },
  openGraph: {
    title: 'Maifast',
    description: 'An AI chat and spreadsheet workspace.',
    images: [
      {
        url: '/PNG.png',
        width: 1024,
        height: 1024,
        alt: 'Maifast',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Maifast',
    description: 'An AI chat and spreadsheet workspace.',
    images: ['/PNG.png'],
  },
};

const themeInitScript = `
  (function () {
    try {
      var storedTheme = localStorage.getItem('theme');
      var theme = storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset.theme = theme;
    } catch (error) {
      document.documentElement.classList.add('dark');
      document.documentElement.dataset.theme = 'dark';
    }
  })();
`;

const suppressDeprecatedBeforeUnloadScript = `
  (function () {
    try {
      if (!window || !window.addEventListener) return;
      var originalAddEventListener = window.addEventListener;
      window.addEventListener = function (type, listener, options) {
        if (type === 'beforeunload' || type === 'unload') {
          return;
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    } catch (error) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased transition-colors duration-300`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {process.env.NODE_ENV === 'development' ? (
          <script
            dangerouslySetInnerHTML={{ __html: suppressDeprecatedBeforeUnloadScript }}
          />
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

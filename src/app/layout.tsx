import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import { Providers } from '@/components/providers/Providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Maifast',
  description: 'An AI chat and spreadsheet workspace.',
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

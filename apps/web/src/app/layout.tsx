import type { Metadata, Viewport } from 'next';
import { Baloo_2, Nunito_Sans } from 'next/font/google';
import { ComfortSync } from '@/components/ComfortSync';
import { DioramaStage } from '@/components/DioramaStage';
import { PwaRegister } from '@/components/PwaRegister';
import { RotatePrompt } from '@/components/RotatePrompt';
import './globals.css';

const display = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'parlour',
  description: 'Cozy card games. Blitz first.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'parlour', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#152833',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh antialiased">
        <DioramaStage />
        <div className="relative z-10 min-h-dvh">{children}</div>
        <RotatePrompt />
        <ComfortSync />
        <PwaRegister />
      </body>
    </html>
  );
}

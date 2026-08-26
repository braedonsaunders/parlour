import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Baloo_2, Nunito_Sans } from 'next/font/google';
import { ComfortSync } from '@/components/ComfortSync';
import { ColorModeSync } from '@/components/ColorModeSync';
import { LocaleSync } from '@/components/LocaleSync';
import { AudioDirector } from '@/components/AudioDirector';
import { SceneStage } from '@/components/backgrounds/SceneStage';
import { SplashScreen } from '@/components/SplashScreen';
import { MenuShell } from '@/components/menu/MenuShell';
import { WipeOverlay } from '@/components/transitions/WipeOverlay';
import { PwaRegister } from '@/components/PwaRegister';
import { Analytics } from '@vercel/analytics/next';
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
  title: {
    default: 'parlour',
    template: '%s · parlour',
  },
  applicationName: 'parlour',
  description:
    'Pull up a chair for beautifully animated card games with friends or offline against bots.',
  keywords: ['card games', 'multiplayer', 'offline games', 'party games'],
  category: 'games',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/icon-192.png', type: 'image/png', sizes: '192x192' }],
    shortcut: '/icon-192.png',
  },
  appleWebApp: { capable: true, title: 'parlour', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#152833',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
};

const developmentPwaReset = `
(() => {
  const marker = 'parlour-pwa-dev-reset';

  const reset = async () => {
    if (!('serviceWorker' in navigator)) return;

    const registrations = await navigator.serviceWorker.getRegistrations();
    const parlourRegistrations = registrations.filter((registration) => {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      return worker && new URL(worker.scriptURL).pathname === '/sw.js';
    });

    await Promise.all(parlourRegistrations.map((registration) => registration.unregister()));

    const cacheKeys = 'caches' in window ? await caches.keys() : [];
    const parlourCacheKeys = cacheKeys.filter((key) => key.startsWith('parlour-'));
    await Promise.all(parlourCacheKeys.map((key) => caches.delete(key)));

    const foundPwaState = parlourRegistrations.length > 0 || parlourCacheKeys.length > 0;
    const resetAttempts = Number(sessionStorage.getItem(marker) ?? 0);

    if (foundPwaState && resetAttempts < 2) {
      sessionStorage.setItem(marker, String(resetAttempts + 1));
      window.location.reload();
      return;
    }

    sessionStorage.removeItem(marker);
  };

  void reset().catch(() => undefined);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} data-color-mode="richer">
      <body className="min-h-dvh antialiased">
        {process.env.NODE_ENV === 'development' ? (
          <Script
            id="parlour-pwa-development-reset"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: developmentPwaReset }}
          />
        ) : null}
        <SceneStage />
        <MenuShell>{children}</MenuShell>
        <WipeOverlay />
        <SplashScreen />
        <ComfortSync />
        <ColorModeSync />
        <LocaleSync />
        <AudioDirector />
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}

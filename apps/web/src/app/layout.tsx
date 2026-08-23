import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'parlour',
  description: 'Cozy card games. Blitz first.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#152833',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

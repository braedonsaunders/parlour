'use client';

import { useEffect, useState } from 'react';
import { recoverPwa } from '@/lib/pwaRecovery';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    console.error('[parlour] unrecoverable app error', error);
  }, [error]);

  const reloadClean = () => {
    if (recovering) return;
    setRecovering(true);
    void recoverPwa().catch(() => window.location.reload());
  };

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100dvh',
          margin: 0,
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          color: '#fff8e8',
          background: 'radial-gradient(circle at top, #315a62, #101b29 68%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 440, textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px', color: '#ffd17c', fontWeight: 800 }}>Fresh cards needed</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 8vw, 48px)' }}>
            Parlour got stuck between versions.
          </h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.5, color: '#d8e7e8' }}>
            Reload a clean copy of the app. Your invite link will stay in place.
          </p>
          <button
            type="button"
            onClick={reloadClean}
            disabled={recovering}
            data-testid="pwa-clean-reload"
            style={{
              minHeight: 48,
              border: 0,
              borderRadius: 999,
              padding: '12px 22px',
              color: '#43200a',
              background: '#ffd17c',
              font: 'inherit',
              fontWeight: 800,
            }}
          >
            {recovering ? 'Refreshing…' : 'Reload clean copy'}
          </button>
        </main>
      </body>
    </html>
  );
}

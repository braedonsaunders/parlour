import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('installable offline shell', () => {
  it('declares maskable 192px and 512px PNG icons', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
    ) as { icons: { src: string; sizes: string; type: string; purpose?: string }[] };

    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((candidate) => candidate.sizes === size);
      expect(icon).toMatchObject({ type: 'image/png' });
      expect(icon?.purpose).toContain('maskable');
      expect(
        readFileSync(join(process.cwd(), 'public', icon!.src))
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
    }
  });

  it('precaches a dedicated offline document and serves it for failed navigation', () => {
    const worker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(worker).toContain("'/offline.html'");
    expect(worker).toContain("caches.match('/offline.html')");
    expect(readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8')).toContain(
      'You’re still at the table',
    );
  });
});

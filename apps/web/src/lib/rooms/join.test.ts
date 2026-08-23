import { describe, expect, it } from 'vitest';
import { attemptJoin } from './join';

describe('attemptJoin', () => {
  it('rejects malformed codes without attempting a connection', async () => {
    const short = await attemptJoin('A1');
    expect(short).toMatchObject({ ok: false, reason: 'bad-format' });
    if (!short.ok) expect(short.message).toContain('exactly 4');

    const charset = await attemptJoin('0O1I');
    expect(charset).toMatchObject({ ok: false, reason: 'bad-format' });
    if (!charset.ok) expect(charset.message).toContain('0');
  });

  it('fails closed with an honest unreachable outcome for valid codes (no directory yet)', async () => {
    const outcome = await attemptJoin('k7p9');
    expect(outcome).toMatchObject({ ok: false, reason: 'no-directory' });
    if (!outcome.ok) expect(outcome.message).toContain('K7P9');
  });

  it('never returns a fake success', async () => {
    for (const raw of ['ABCD', '', '!!!', 'ZZZZ']) {
      const outcome = await attemptJoin(raw);
      expect(outcome.ok).toBe(false);
    }
  });
});

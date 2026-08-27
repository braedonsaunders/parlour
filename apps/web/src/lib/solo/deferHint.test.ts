import { describe, expect, it, vi } from 'vitest';
import { attachDeferredHint } from './deferHint';

describe('attachDeferredHint', () => {
  it('does not read the hint until someone asks, even under stringify', () => {
    const read = vi.fn(() => 'solved');
    const snapshot = attachDeferredHint({ mode: 'daily' }, read);

    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).toBe('{"mode":"daily"}');
    expect({ ...snapshot }).toEqual({ mode: 'daily' });
    expect(read).not.toHaveBeenCalled();

    expect(snapshot.hint).toBe('solved');
    expect(snapshot.hint).toBe('solved');
    expect(read).toHaveBeenCalledOnce();
  });
});

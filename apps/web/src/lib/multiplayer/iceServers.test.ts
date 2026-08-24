import { describe, expect, it } from 'vitest';
import { DEFAULT_STUN_URLS, FALLBACK_TURN, iceServersFrom, usesFallbackRelay } from './iceServers';

describe('iceServersFrom', () => {
  it('falls back to the bundled public STUN and TURN when nothing is configured', () => {
    const servers = iceServersFrom({});
    expect(servers[0]?.urls).toEqual([...DEFAULT_STUN_URLS]);
    expect(servers).toContainEqual(FALLBACK_TURN);
    expect(usesFallbackRelay(servers)).toBe(true);
  });

  it('replaces the shared relay rather than adding to it', () => {
    const servers = iceServersFrom({
      turnUrls: 'turns:turn.example.org:443',
      turnUsername: 'parlour',
      turnCredential: 'secret',
    });
    expect(usesFallbackRelay(servers)).toBe(false);
    expect(servers).toContainEqual({
      urls: ['turns:turn.example.org:443'],
      username: 'parlour',
      credential: 'secret',
    });
  });

  it('accepts several comma-separated urls with surrounding space', () => {
    const servers = iceServersFrom({
      turnUrls: ' turn:a.example:3478 , turns:b.example:443 ',
      turnUsername: 'u',
      turnCredential: 'p',
    });
    expect(servers.at(-1)?.urls).toEqual(['turn:a.example:3478', 'turns:b.example:443']);
  });

  it('overrides STUN on its own, without touching the relay', () => {
    const servers = iceServersFrom({ stunUrls: 'stun:stun.example.org:3478' });
    expect(servers[0]?.urls).toEqual(['stun:stun.example.org:3478']);
    expect(usesFallbackRelay(servers)).toBe(true);
  });

  it('ignores a TURN server configured without credentials', () => {
    // Handing the browser a relay it cannot authenticate against would fail
    // every allocation and look like a network fault rather than a config one.
    const servers = iceServersFrom({ turnUrls: 'turn:turn.example.org:3478' });
    expect(usesFallbackRelay(servers)).toBe(true);
    expect(servers.some((server) => String(server.urls).includes('turn.example.org'))).toBe(false);
  });
});

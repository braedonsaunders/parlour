import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';
import {
  applyListingRecord,
  browseOpenTables,
  canPublishListings,
  listingContent,
  LISTING_TTL_SECONDS,
  OPEN_TABLE_KIND,
  OPEN_TABLE_TAG,
  readListingEvent,
  sanitizeHostName,
  sortListings,
  sweepListings,
  withdrawalContent,
  type OpenTableListing,
  type OwnTableListing,
} from './RoomDirectory';
import type { RelayPool } from './relays';

const NOW = 1_800_000_000;

function ownListing(overrides: Partial<OwnTableListing> = {}): OwnTableListing {
  return {
    code: 'ABCD',
    gameId: 'spades',
    seats: 4,
    filled: 2,
    hostName: 'Rosa',
    security: 'open',
    ...overrides,
  };
}

function signedListing(
  secretKey: Uint8Array,
  {
    content,
    code = 'ABCD',
    createdAt = NOW,
    expiresAt = NOW + LISTING_TTL_SECONDS,
    tag = OPEN_TABLE_TAG,
    kind = OPEN_TABLE_KIND,
  }: {
    content: string;
    code?: string;
    createdAt?: number;
    expiresAt?: number;
    tag?: string;
    kind?: number;
  },
): Event {
  return finalizeEvent(
    {
      kind,
      created_at: createdAt,
      tags: [
        ['d', code],
        ['t', tag],
        ['expiration', String(expiresAt)],
      ],
      content,
    },
    secretKey,
  );
}

describe('sanitizeHostName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeHostName('  Rosa  ')).toBe('Rosa');
  });

  it('strips control characters and bidi overrides a row could lie with', () => {
    expect(sanitizeHostName('Ro‮sa')).toBe('Rosa');
  });

  it('clamps a name long enough to push the rest of the row off screen', () => {
    expect(sanitizeHostName('x'.repeat(200))).toHaveLength(24);
  });

  it('refuses anything that is not a non-empty string', () => {
    expect(sanitizeHostName(42)).toBeNull();
    expect(sanitizeHostName(undefined)).toBeNull();
    expect(sanitizeHostName('   ')).toBeNull();
  });
});

describe('readListingEvent', () => {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  it('reads a well-formed row', () => {
    const record = readListingEvent(
      signedListing(secretKey, { content: listingContent(ownListing()) }),
      NOW,
    );
    expect(record?.listing).toMatchObject({
      code: 'ABCD',
      hostPubkey: pubkey,
      gameId: 'spades',
      seats: 4,
      filled: 2,
      hostName: 'Rosa',
      security: 'open',
    });
  });

  it('reads a withdrawal as a real statement rather than a parse failure', () => {
    const record = readListingEvent(
      signedListing(secretKey, { content: withdrawalContent() }),
      NOW,
    );
    expect(record).not.toBeNull();
    expect(record?.listing).toBeNull();
  });

  /**
   * Round-tripped through JSON on purpose: that is how an event arrives from a
   * relay, and it is also what drops the "already verified" symbol nostr-tools
   * stamps onto anything `finalizeEvent` produced. A spread copy keeps that
   * symbol and would pass verification no matter what was done to the content.
   */
  it('refuses an event whose signature does not hold', () => {
    const event = signedListing(secretKey, { content: listingContent(ownListing()) });
    const tampered = JSON.parse(JSON.stringify(event)) as Event;
    tampered.content = listingContent(ownListing({ filled: 1 }));
    expect(readListingEvent(tampered, NOW)).toBeNull();
  });

  it('refuses a row that has already expired', () => {
    const event = signedListing(secretKey, {
      content: listingContent(ownListing()),
      expiresAt: NOW - 1,
    });
    expect(readListingEvent(event, NOW)).toBeNull();
  });

  it('refuses the wrong kind or a missing discovery tag', () => {
    const wrongKind = signedListing(secretKey, {
      content: listingContent(ownListing()),
      kind: OPEN_TABLE_KIND + 1,
    });
    const wrongTag = signedListing(secretKey, {
      content: listingContent(ownListing()),
      tag: 'something-else',
    });
    expect(readListingEvent(wrongKind, NOW)).toBeNull();
    expect(readListingEvent(wrongTag, NOW)).toBeNull();
  });

  it('refuses a code that is not a room code', () => {
    const event = signedListing(secretKey, {
      content: listingContent(ownListing()),
      code: 'AB0I',
    });
    expect(readListingEvent(event, NOW)).toBeNull();
  });

  /**
   * The row is unauthenticated input from a stranger. A seat count the game
   * cannot actually seat is the cheap way to make the browser render a table
   * that refuses everyone who taps it.
   */
  it('refuses a table this build could not seat', () => {
    const badSeats = signedListing(secretKey, {
      content: listingContent(ownListing({ seats: 3 })),
    });
    const badFilled = signedListing(secretKey, {
      content: listingContent(ownListing({ filled: 9 })),
    });
    const badGame = signedListing(secretKey, {
      content: JSON.stringify({ ...ownListing(), gameId: 'chess' }),
    });
    expect(readListingEvent(badSeats, NOW)).toBeNull();
    expect(readListingEvent(badFilled, NOW)).toBeNull();
    expect(readListingEvent(badGame, NOW)).toBeNull();
  });

  it('refuses content that is not the shape it claims', () => {
    for (const content of ['not json', '[]', '"string"', '{}']) {
      expect(readListingEvent(signedListing(secretKey, { content }), NOW)).toBeNull();
    }
  });

  it('defaults an unstated privacy tier to open, as room settings do', () => {
    const event = signedListing(secretKey, {
      content: JSON.stringify({ gameId: 'gin', seats: 2, filled: 1, hostName: 'Ada' }),
    });
    expect(readListingEvent(event, NOW)?.listing?.security).toBe('open');
  });
});

describe('applyListingRecord', () => {
  const listing = (over: Partial<OpenTableListing> = {}): OpenTableListing => ({
    code: 'ABCD',
    hostPubkey: 'host',
    gameId: 'spades',
    seats: 4,
    filled: 2,
    hostName: 'Rosa',
    security: 'open',
    listedAt: NOW,
    expiresAt: NOW + LISTING_TTL_SECONDS,
    ...over,
  });

  it('adds a row and reports the change', () => {
    const table = new Map<string, OpenTableListing>();
    const seen = new Map<string, number>();
    expect(
      applyListingRecord(table, { key: 'k', publishedAt: NOW, listing: listing() }, seen),
    ).toBe(true);
    expect(table.size).toBe(1);
  });

  /**
   * Relays replay stored events in no particular order, and every host in the
   * browser is refreshing on a timer. Without this, a row that was replaced
   * three refreshes ago can arrive last and win.
   */
  it('never lets older news beat newer', () => {
    const table = new Map<string, OpenTableListing>();
    const seen = new Map<string, number>();
    applyListingRecord(
      table,
      { key: 'k', publishedAt: NOW, listing: listing({ filled: 3 }) },
      seen,
    );
    const stale = applyListingRecord(
      table,
      { key: 'k', publishedAt: NOW - 60, listing: listing({ filled: 1 }) },
      seen,
    );
    expect(stale).toBe(false);
    expect(table.get('k')?.filled).toBe(3);
  });

  it('removes the row when the host withdraws it', () => {
    const table = new Map<string, OpenTableListing>();
    const seen = new Map<string, number>();
    applyListingRecord(table, { key: 'k', publishedAt: NOW, listing: listing() }, seen);
    applyListingRecord(table, { key: 'k', publishedAt: NOW + 1, listing: null }, seen);
    expect(table.size).toBe(0);
  });

  /**
   * Six relay sockets echoing one refresh is six identical events. Re-rendering
   * the list once per socket is how a browser flickers.
   */
  it('reports no change for a repeat of what it already has', () => {
    const table = new Map<string, OpenTableListing>();
    const seen = new Map<string, number>();
    const record = { key: 'k', publishedAt: NOW, listing: listing() };
    expect(applyListingRecord(table, record, seen)).toBe(true);
    expect(applyListingRecord(table, record, seen)).toBe(false);
  });

  it('sweeps rows whose host stopped refreshing them', () => {
    const table = new Map<string, OpenTableListing>([
      ['fresh', listing({ expiresAt: NOW + 10 })],
      ['stale', listing({ expiresAt: NOW - 10 })],
    ]);
    expect(sweepListings(table, NOW)).toBe(true);
    expect([...table.keys()]).toEqual(['fresh']);
    expect(sweepListings(table, NOW)).toBe(false);
  });
});

describe('sortListings', () => {
  it('puts the table closest to starting first, then the freshest', () => {
    const base = {
      hostPubkey: 'host',
      gameId: 'spades' as const,
      hostName: 'Rosa',
      security: 'open' as const,
      expiresAt: NOW + LISTING_TTL_SECONDS,
    };
    const sorted = sortListings([
      { ...base, code: 'AAAA', seats: 4, filled: 1, listedAt: NOW },
      { ...base, code: 'BBBB', seats: 4, filled: 3, listedAt: NOW - 30 },
      { ...base, code: 'CCCC', seats: 4, filled: 2, listedAt: NOW },
      { ...base, code: 'DDDD', seats: 4, filled: 3, listedAt: NOW },
    ]);
    expect(sorted.map((table) => table.code)).toEqual(['DDDD', 'BBBB', 'CCCC', 'AAAA']);
  });
});

describe('canPublishListings', () => {
  it('recognises a publisher and refuses signalling that is not one', () => {
    expect(canPublishListings({ list: () => {}, unlist: () => {} })).toBe(true);
    expect(canPublishListings({ announce: () => {} })).toBe(false);
    expect(canPublishListings(null)).toBe(false);
    expect(canPublishListings('list')).toBe(false);
  });
});

describe('browseOpenTables', () => {
  function fakePool(): RelayPool & {
    emit(event: Event): void;
    eose(): void;
    closed: boolean;
    filters: unknown[];
  } {
    let onevent: ((event: Event) => void) | undefined;
    let oneose: (() => void) | undefined;
    const pool = {
      filters: [] as unknown[],
      closed: false,
      ensureRelay: async () => undefined,
      publish: () => [],
      querySync: async () => [],
      subscribeMany(
        _relays: string[],
        filter: unknown,
        params: { onevent(event: Event): void; oneose?(): void },
      ) {
        pool.filters.push(filter);
        onevent = params.onevent;
        oneose = params.oneose;
        return { close: () => undefined };
      },
      close: () => {
        pool.closed = true;
      },
      emit: (event: Event) => onevent?.(event),
      eose: () => oneose?.(),
    };
    return pool as unknown as ReturnType<typeof fakePool>;
  }

  it('subscribes to the open-table kind inside the freshness window', () => {
    const pool = fakePool();
    const browser = browseOpenTables({
      onChange: () => undefined,
      pool,
      relays: ['wss://relay.test'],
      now: () => NOW * 1_000,
    });
    expect(pool.filters[0]).toMatchObject({
      kinds: [OPEN_TABLE_KIND],
      '#t': [OPEN_TABLE_TAG],
      since: NOW - LISTING_TTL_SECONDS,
    });
    browser.close();
  });

  it('surfaces a signed row and drops it again when the host withdraws', () => {
    const secretKey = generateSecretKey();
    const pool = fakePool();
    const seen: Array<readonly OpenTableListing[]> = [];
    const browser = browseOpenTables({
      onChange: (tables) => seen.push(tables),
      pool,
      relays: ['wss://relay.test'],
      now: () => NOW * 1_000,
    });

    pool.emit(signedListing(secretKey, { content: listingContent(ownListing()) }));
    expect(seen.at(-1)).toHaveLength(1);
    expect(seen.at(-1)?.[0]?.hostName).toBe('Rosa');

    pool.emit(signedListing(secretKey, { content: withdrawalContent(), createdAt: NOW + 1 }));
    expect(seen.at(-1)).toHaveLength(0);
    browser.close();
  });

  it('ignores a row it cannot believe rather than rendering it', () => {
    const secretKey = generateSecretKey();
    const pool = fakePool();
    const onChange = vi.fn();
    const browser = browseOpenTables({
      onChange,
      pool,
      relays: ['wss://relay.test'],
      now: () => NOW * 1_000,
    });

    pool.emit(signedListing(secretKey, { content: 'not json' }));
    expect(onChange).not.toHaveBeenCalled();
    browser.close();
  });

  it('sweeps aged-out rows on its own clock', () => {
    vi.useFakeTimers();
    try {
      const secretKey = generateSecretKey();
      const pool = fakePool();
      const seen: Array<readonly OpenTableListing[]> = [];
      let clock = NOW * 1_000;
      const browser = browseOpenTables({
        onChange: (tables) => seen.push(tables),
        pool,
        relays: ['wss://relay.test'],
        now: () => clock,
        sweepIntervalMs: 1_000,
      });

      pool.emit(signedListing(secretKey, { content: listingContent(ownListing()) }));
      expect(seen.at(-1)).toHaveLength(1);

      clock = (NOW + LISTING_TTL_SECONDS + 1) * 1_000;
      vi.advanceTimersByTime(1_000);
      expect(seen.at(-1)).toHaveLength(0);
      browser.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports settling so an empty list can tell "none" from "still looking"', () => {
    const pool = fakePool();
    const onSettled = vi.fn();
    const browser = browseOpenTables({
      onChange: () => undefined,
      onSettled,
      pool,
      relays: ['wss://relay.test'],
      now: () => NOW * 1_000,
    });
    pool.eose();
    expect(onSettled).toHaveBeenCalledOnce();
    browser.close();
  });

  it('says nothing more once closed, and leaves an injected pool alone', () => {
    const secretKey = generateSecretKey();
    const pool = fakePool();
    const onChange = vi.fn();
    const browser = browseOpenTables({
      onChange,
      pool,
      relays: ['wss://relay.test'],
      now: () => NOW * 1_000,
    });
    browser.close();
    pool.emit(signedListing(secretKey, { content: listingContent(ownListing()) }));
    expect(onChange).not.toHaveBeenCalled();
    expect(pool.closed).toBe(false);
  });
});

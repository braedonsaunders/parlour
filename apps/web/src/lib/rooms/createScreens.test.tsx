import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CREATE_ROUTE_SEGMENTS, CREATE_SCREENS } from './createScreens';
import { MULTIPLAYER_GAME_IDS, type MultiplayerGameId } from './gameIds';
import { gameForRoomSegment, roomSegmentFor } from './tableRoute';

const APP = path.join(__dirname, '..', '..', 'app');

function text(node: ReactNode): string {
  return renderToStaticMarkup(<>{node}</>).replace(/<[^>]*>/g, '');
}

/**
 * What each create screen looked like before the fourteen pages became one.
 *
 * Lifted mechanically out of the pre-refactor per-game create pages rather
 * than retyped, because a table transcribed by hand is a table with one wrong
 * glyph in it. This is the only reason to believe the collapse changed nothing,
 * so it is written down rather than left to a reviewer's memory of what the
 * screens used to say.
 */
const AS_SHIPPED: Record<
  MultiplayerGameId,
  {
    backHref: string;
    backLabel: string;
    loading: string;
    botGlyph: string;
    humanGlyph: string;
    waitsForStorage: boolean;
    hasBlurb: boolean;
  }
> = {
  blitz: {
    backHref: '/play',
    backLabel: 'Back to Blitz',
    loading: 'Lighting the table…',
    botGlyph: '♠',
    humanGlyph: '♣',
    waitsForStorage: true,
    hasBlurb: true,
  },
  cribbage: {
    backHref: '/cribbage',
    backLabel: 'Back to Cribbage',
    loading: 'Drilling a friend board…',
    botGlyph: 'P',
    humanGlyph: '◆',
    waitsForStorage: false,
    hasBlurb: true,
  },
  eights: {
    backHref: '/eights',
    backLabel: 'Back to Crazy Eights',
    loading: 'Shuffling the pack…',
    botGlyph: '8',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  euchre: {
    backHref: '/euchre',
    backLabel: 'Back to Euchre',
    loading: 'Marking a euchre table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: false,
    hasBlurb: true,
  },
  gin: {
    backHref: '/gin',
    backLabel: 'Back to Gin',
    loading: 'Marking a Gin table…',
    botGlyph: '♣',
    humanGlyph: '◆',
    waitsForStorage: false,
    hasBlurb: true,
  },
  hearts: {
    backHref: '/hearts',
    backLabel: 'Back to Hearts',
    loading: 'Marking a Hearts table…',
    botGlyph: '♥',
    humanGlyph: '◆',
    waitsForStorage: false,
    hasBlurb: true,
  },
  ohhell: {
    backHref: '/ohhell',
    backLabel: 'Back to Oh Hell!',
    loading: 'Turning a card for trump…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  poker: {
    backHref: '/poker',
    backLabel: 'Back to Poker',
    loading: 'Setting out the chips…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: false,
  },
  president: {
    backHref: '/president',
    backLabel: 'Back to President',
    loading: 'Setting the ladder…',
    botGlyph: '♛',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  ratscrew: {
    backHref: '/ratscrew',
    backLabel: 'Back to Rat Screw',
    loading: 'Marking a Rat Screw table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  scopa: {
    backHref: '/scopa',
    backLabel: 'Back to Scopa',
    loading: 'Laying out the table…',
    botGlyph: '●',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  spades: {
    backHref: '/spades',
    backLabel: 'Back to Spades',
    loading: 'Marking a spades table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: false,
    hasBlurb: true,
  },
  spite: {
    backHref: '/spite',
    backLabel: 'Back to Spite & Malice',
    loading: 'Stacking the piles…',
    botGlyph: '★',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
  wildpile: {
    backHref: '/wild',
    backLabel: 'Back to Wild',
    loading: 'Marking a Wild table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    waitsForStorage: true,
    hasBlurb: true,
  },
};

describe('create screens', () => {
  it('describes every game a room can be opened for', () => {
    expect(Object.keys(CREATE_SCREENS).sort()).toEqual([...MULTIPLAYER_GAME_IDS].sort());
  });

  it.each(MULTIPLAYER_GAME_IDS)('%s renders exactly what its own page rendered', (gameId) => {
    const screen = CREATE_SCREENS[gameId];
    const shipped = AS_SHIPPED[gameId];
    expect(screen.backHref).toBe(shipped.backHref);
    expect(screen.backLabel).toBe(shipped.backLabel);
    expect(screen.loading).toBe(shipped.loading);
    expect(screen.botGlyph).toBe(shipped.botGlyph);
    expect(screen.humanGlyph).toBe(shipped.humanGlyph);
    expect(screen.blurb !== null).toBe(shipped.hasBlurb);
  });

  /**
   * Poker's screen has no line under the lobby. Asserted rather than left
   * implicit, because "every other game has one" is exactly the reasoning that
   * would add one to Poker and call it a fix.
   */
  it('leaves Poker without a blurb', () => {
    expect(CREATE_SCREENS.poker.blurb).toBeNull();
  });

  /**
   * Which screens wait for local storage is not cosmetic: a room opened before
   * the setup store rehydrates announces the shipped defaults. Five screens
   * shipped without the wait, and this pins that as it was — changing it adds a
   * loading frame where there is none today, so it is a decision, not a tidy-up.
   */
  it.each(MULTIPLAYER_GAME_IDS)('%s waits for storage exactly as it did', (gameId) => {
    expect(CREATE_SCREENS[gameId].hydrate !== null).toBe(AS_SHIPPED[gameId].waitsForStorage);
  });

  it('keeps the two blurbs that read differently at different table sizes', () => {
    const eights = CREATE_SCREENS.eights.blurb!;
    expect(text(eights(2))).toContain('with 1 friend — the pack');
    expect(text(eights(4))).toContain('with 3 friends — the pack');

    const scopa = CREATE_SCREENS.scopa.blurb!;
    expect(text(scopa(4))).toContain('Four and six play as partnerships');
    expect(text(scopa(6))).toContain('Four and six play as partnerships');
    expect(text(scopa(2))).toContain('or fill empty chairs with bots');
    expect(text(scopa(3))).toContain('or fill empty chairs with bots');
  });
});

describe('create routes', () => {
  /**
   * The bug this exists for: the generated routes were built from game ids, so
   * Wild Pile's lobby landed at `/wildpile/create` while the shelf went on
   * linking to `/wild/create`. Nothing in types caught it — both are strings.
   */
  it('routes every game to the segment its table already uses', () => {
    for (const gameId of MULTIPLAYER_GAME_IDS) {
      const segment = roomSegmentFor(gameId);
      if (segment === null) continue;
      expect(CREATE_ROUTE_SEGMENTS).toContain(segment);
      expect(gameForRoomSegment(segment)).toBe(gameId);
    }
  });

  it('gives Blitz no segment, because its room lives at /create', () => {
    expect(roomSegmentFor('blitz')).toBeNull();
    expect(CREATE_ROUTE_SEGMENTS).not.toContain('blitz');
    expect(CREATE_ROUTE_SEGMENTS).toHaveLength(MULTIPLAYER_GAME_IDS.length - 1);
  });

  /** Every "Create a room" button on the shelf has to land somewhere real. */
  it('generates a route for every createHref the game pages link to', () => {
    const linked = fs
      .readdirSync(APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const page = path.join(APP, entry.name, 'page.tsx');
        if (!fs.existsSync(page)) return [];
        const match = /createHref="([^"]+)"/.exec(fs.readFileSync(page, 'utf8'));
        return match ? [match[1] as string] : [];
      });

    expect(linked.length).toBeGreaterThanOrEqual(MULTIPLAYER_GAME_IDS.length - 1);
    for (const href of linked) {
      if (href === '/create') continue;
      const segment = /^\/([^/]+)\/create$/.exec(href)?.[1] ?? href;
      expect([href, CREATE_ROUTE_SEGMENTS.includes(segment)]).toEqual([href, true]);
    }
  });

  /**
   * The guard that keeps the collapse collapsed.
   *
   * A game that grows its own create page again would not fail any other test —
   * it would simply shadow the shared one and drift, which is how there came to
   * be fourteen of them the first time.
   */
  it('leaves no game holding a create page of its own', () => {
    const strays = fs
      .readdirSync(APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '[game]' && entry.name !== 'create')
      .filter((entry) => fs.existsSync(path.join(APP, entry.name, 'create', 'page.tsx')))
      .map((entry) => `${entry.name}/create/page.tsx`);
    expect(strays).toEqual([]);
  });
});

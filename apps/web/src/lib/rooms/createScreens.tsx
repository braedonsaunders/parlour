import { applyPreset, type RuleValues } from '@parlour/engine';
import { euchreConfig } from '@parlour/game-euchre';
import { ohhellConfig } from '@parlour/game-ohhell';
import { pokerConfig } from '@parlour/game-poker';
import { scopaConfig } from '@parlour/game-scopa';
import { spadesConfig } from '@parlour/game-spades';
import { spiteConfig } from '@parlour/game-spite';
import type { ReactNode } from 'react';
import { scopaPresetFor } from '@/lib/scopa/modes';
import { useSetupStore } from '@/stores/setup';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';
import { eightsRulesFor, useEightsSetupStore } from '@/stores/eightsSetup';
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import { ginRulesFor, useGinSetupStore } from '@/stores/ginSetup';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';
import { usePokerSetupStore } from '@/stores/pokerSetup';
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';
import { ratscrewRulesFor, useRatscrewSetupStore } from '@/stores/ratscrewSetup';
import { useScopaSetupStore } from '@/stores/scopaSetup';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import { useSpiteSetupStore } from '@/stores/spiteSetup';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';
import type { PersistApi } from '@/stores/usePersistHydrated';
import { type MultiplayerGameId } from './gameIds';

/**
 * Everything one game's create screen does differently, and nothing it does the
 * same.
 *
 * There used to be fourteen create pages. They were 84% identical — the session
 * ref, the open-on-mount effect, the error branch, the seat mapping, the lobby,
 * the leave link — and what genuinely varied was this: a route back, a glyph,
 * two strings, and how the game turns its setup store into room settings. Every
 * one of those fourteen files also carried its copy in English only, because
 * copy repeated fourteen times is copy the catalogues never reached.
 *
 * So this is the whole per-game surface now, and it is a total `Record`: adding
 * a game to {@link MULTIPLAYER_GAME_IDS} without describing its create screen is
 * a compile error, and describing one is all a new game has to do. There is no
 * page to write — `app/[game]/create/page.tsx` builds the route from this table.
 */
export type CreateScreen = {
  /** Where Leave, and the error branch's button, go back to. */
  backHref: string;
  /** The error branch's button label. Not the same as Leave. */
  backLabel: string;
  /** Shown while the room is being opened. */
  loading: string;
  /** Seat-plate glyph for a house bot, and for a person. */
  botGlyph: string;
  humanGlyph: string;
  /**
   * The persisted setup store this screen must wait for, or null to open the
   * room on the first paint.
   *
   * Null is not an oversight, and it is not free either — see
   * {@link usePersistHydrated}, which exists because a room opened before the
   * store rehydrated announced the shipped defaults rather than the table the
   * host was looking at. The five games that pass null all have a FIXED seat
   * count, so the visible half of that bug cannot reach them; their mode can
   * still be stale. Kept exactly as each screen shipped, because making them all
   * wait would add a loading frame to five screens that do not have one today.
   */
  hydrate: PersistApi | null;
  /**
   * The room this game's setup store is asking for, read once when it opens.
   *
   * Deliberately not a hook. Every one of the old pages read these values
   * through a selector and then used them exactly once, inside an effect
   * guarded so it could never run twice — so the subscription bought nothing
   * and cost a re-render on every keystroke of a setup screen left mounted.
   */
  room(): { seats: number; config: RuleValues };
  /**
   * The line under the lobby, or null for a game that has none.
   *
   * Poker has none. That is not an omission to tidy up — it is what the screen
   * looks like today, and this table's job is to say so.
   *
   * Still English in every language, exactly as all fourteen pages were.
   * Translating it is a deliberate change to what these screens render and
   * belongs in its own commit, not smuggled into a refactor that promised to
   * change nothing.
   */
  blurb: ((capacity: number) => ReactNode) | null;
};

export const CREATE_SCREENS: Readonly<Record<MultiplayerGameId, CreateScreen>> = {
  blitz: {
    backHref: '/play',
    backLabel: 'Back to Blitz',
    loading: 'Lighting the table…',
    botGlyph: '♠',
    humanGlyph: '♣',
    hydrate: useSetupStore,
    room: () => ({ seats: useSetupStore.getState().seats, config: {} }),
    blurb: (capacity) => (
      <>
        This {capacity}-seat table starts when every chair is filled. Share the code with friends,
        or fill empty chairs with bots.
      </>
    ),
  },
  cribbage: {
    backHref: '/cribbage',
    backLabel: 'Back to Cribbage',
    loading: 'Drilling a friend board…',
    botGlyph: 'P',
    humanGlyph: '◆',
    hydrate: null,
    room: () => {
      const { mode, overrides } = useCribbageSetupStore.getState();
      // A friend board is one game, never a best-of — the room clamps it too,
      // so a forged announcement cannot imply a match.
      return { seats: 2, config: { ...cribbageRulesFor(mode, overrides), gamesToWin: 1 } };
    },
    blurb: () => (
      <>
        Share the code with one friend. This room plays a complete race to 121 with deterministic
        host and guest replays.
      </>
    ),
  },
  eights: {
    backHref: '/eights',
    backLabel: 'Back to Crazy Eights',
    loading: 'Shuffling the pack…',
    botGlyph: '8',
    humanGlyph: '◆',
    hydrate: useEightsSetupStore,
    room: () => {
      const { mode, seats, overrides } = useEightsSetupStore.getState();
      return { seats, config: eightsRulesFor(mode, overrides) };
    },
    blurb: (capacity) => (
      <>
        This {capacity}-seat table deals as soon as every chair fills. Share the code with{' '}
        {capacity - 1} friend{capacity === 2 ? '' : 's'} — the pack seats up to six.
      </>
    ),
  },
  euchre: {
    backHref: '/euchre',
    backLabel: 'Back to Euchre',
    loading: 'Marking a euchre table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: null,
    room: () => ({
      seats: 4,
      config: applyPreset(euchreConfig, useEuchreSetupStore.getState().mode),
    }),
    blurb: () => (
      <>
        You sit across from your partner. Share the code with three friends — empty chairs play as
        bots until their owners reclaim them.
      </>
    ),
  },
  gin: {
    backHref: '/gin',
    backLabel: 'Back to Gin',
    loading: 'Marking a Gin table…',
    botGlyph: '♣',
    humanGlyph: '◆',
    hydrate: null,
    room: () => {
      const { mode, overrides } = useGinSetupStore.getState();
      return { seats: 2, config: ginRulesFor(mode, overrides) };
    },
    blurb: () => (
      <>
        This head-to-head table starts when your opponent pulls up a chair. Share the code — first
        past the target takes the match.
      </>
    ),
  },
  hearts: {
    backHref: '/hearts',
    backLabel: 'Back to Hearts',
    loading: 'Marking a Hearts table…',
    botGlyph: '♥',
    humanGlyph: '◆',
    hydrate: null,
    room: () => {
      const { mode, overrides } = useHeartsSetupStore.getState();
      return { seats: 4, config: heartsRulesFor(mode, overrides) };
    },
    blurb: () => (
      <>
        This table seats exactly four. Share the code with friends, or fill empty chairs with bots.
      </>
    ),
  },
  ohhell: {
    backHref: '/ohhell',
    backLabel: 'Back to Oh Hell!',
    loading: 'Turning a card for trump…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: useOhHellSetupStore,
    room: () => {
      const { mode, seats } = useOhHellSetupStore.getState();
      return { seats, config: applyPreset(ohhellConfig, mode) };
    },
    blurb: () => (
      <>
        Share the code until every seat is filled, then deal. A friend room plays one round at the
        size you picked — the full arc is a solo match for now.
      </>
    ),
  },
  poker: {
    backHref: '/poker',
    backLabel: 'Back to Poker',
    loading: 'Setting out the chips…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: usePokerSetupStore,
    room: () => {
      const { mode, seats } = usePokerSetupStore.getState();
      return { seats, config: applyPreset(pokerConfig, mode) };
    },
    blurb: null,
  },
  president: {
    backHref: '/president',
    backLabel: 'Back to President',
    loading: 'Setting the ladder…',
    botGlyph: '♛',
    humanGlyph: '◆',
    hydrate: usePresidentSetupStore,
    room: () => {
      const { mode, seats, overrides } = usePresidentSetupStore.getState();
      return { seats, config: presidentRulesFor(mode, overrides) };
    },
    blurb: (capacity) => (
      <>
        This {capacity}-seat ladder starts when every chair fills. Share the code with{' '}
        {capacity - 1} friends — the table seats up to eight.
      </>
    ),
  },
  ratscrew: {
    backHref: '/ratscrew',
    backLabel: 'Back to Rat Screw',
    loading: 'Marking a Rat Screw table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: useRatscrewSetupStore,
    room: () => {
      const { mode, seats, overrides } = useRatscrewSetupStore.getState();
      return { seats, config: ratscrewRulesFor(mode, overrides) };
    },
    blurb: (capacity) => (
      <>
        Slaps resolve in arrival order on the host — first palm on the pile takes it. This{' '}
        {capacity}-seat table starts when every chair is filled.
      </>
    ),
  },
  scopa: {
    backHref: '/scopa',
    backLabel: 'Back to Scopa',
    loading: 'Laying out the table…',
    botGlyph: '●',
    humanGlyph: '◆',
    hydrate: useScopaSetupStore,
    room: () => {
      const { mode, seats } = useScopaSetupStore.getState();
      return { seats, config: applyPreset(scopaConfig, scopaPresetFor(mode)) };
    },
    blurb: (capacity) => (
      <>
        This {capacity}-seat table starts when every chair is filled.
        {capacity === 4 || capacity === 6
          ? ' Four and six play as partnerships, seats alternating around the table.'
          : ' Share the code with friends, or fill empty chairs with bots.'}
      </>
    ),
  },
  spades: {
    backHref: '/spades',
    backLabel: 'Back to Spades',
    loading: 'Marking a spades table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: null,
    room: () => ({
      seats: 4,
      config: applyPreset(spadesConfig, useSpadesSetupStore.getState().mode),
    }),
    blurb: () => (
      <>
        You sit across from your partner, and Spades needs all four seats filled — share the code
        with three friends before starting.
      </>
    ),
  },
  spite: {
    backHref: '/spite',
    backLabel: 'Back to Spite & Malice',
    loading: 'Stacking the piles…',
    botGlyph: '★',
    humanGlyph: '◆',
    hydrate: useSpiteSetupStore,
    room: () => {
      const { mode, seats } = useSpiteSetupStore.getState();
      return { seats, config: applyPreset(spiteConfig, mode) };
    },
    blurb: (capacity) => (
      <>
        This {capacity}-seat table starts when every chair is filled. Share the code with friends,
        or fill empty chairs with bots.
      </>
    ),
  },
  wildpile: {
    backHref: '/wild',
    backLabel: 'Back to Wild',
    loading: 'Marking a Wild table…',
    botGlyph: 'W',
    humanGlyph: '◆',
    hydrate: useWildSetupStore,
    room: () => {
      const { mode, seats, overrides } = useWildSetupStore.getState();
      return { seats, config: wildRulesFor(mode, overrides) };
    },
    blurb: (capacity) => (
      <>
        This {capacity}-seat pile starts when every chair is filled. Share the code with friends, or
        fill empty chairs with bots.
      </>
    ),
  },
};

export function createScreenFor(gameId: MultiplayerGameId): CreateScreen {
  return CREATE_SCREENS[gameId];
}

export { CREATE_ROUTE_SEGMENTS } from './tableRoute';

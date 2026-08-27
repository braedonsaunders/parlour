import {
  VEILED_REDEAL_PENDING,
  createSession,
  isVeilHandle,
  sessionApply,
  sessionInject,
  stateHash,
  veiledDeckOrder,
  type CardId,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { PALACE_DECK, orderOf } from './cards';
import { palaceConfig, type PalaceRules } from './config';
import { palaceGame } from './game';
import type { PalaceState } from './state';

// Swap is off in these fixtures so a fresh deal opens straight into play —
// the starter fallback (a seeded random seat; see `computeStarter`) is
// exercised either way since Veil cannot compare hidden hands.
const DEFAULTS: PalaceRules = palaceConfig.resolve({ allowSwap: false });
const SEATS = 3;

/** The up row is the public setup: `seats * 3` real faces, opened before the deal. */
function openedUp(seats: number): CardId[] {
  return PALACE_DECK.cardIds.slice(0, seats * 3);
}

/** A plain rank (not 2, 8 or 10) so a reveal test lands on the pile, not a special. */
function ordinaryUnusedFace(used: ReadonlySet<CardId>): CardId | undefined {
  return PALACE_DECK.cardIds.find((card) => !used.has(card) && ![2, 8, 10].includes(orderOf(card)));
}

function veiledSession(seats = SEATS) {
  const opened = openedUp(seats);
  const deckOrder = veiledDeckOrder(palaceGame.veil!, seats, opened, DEFAULTS);
  return {
    opened,
    deckOrder,
    session: createSession(palaceGame, {
      seed: 71,
      config: DEFAULTS,
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

describe('palace under Veil', () => {
  it('deals opaque hands and down rows, but a real, public up row', () => {
    const { session, opened } = veiledSession();
    expect(session.state.veiled).toBe(true);
    for (let seat = 0; seat < SEATS; seat++) {
      expect(session.state.hands[seat]!.every(isVeilHandle)).toBe(true);
      expect(session.state.down[seat]!.every(isVeilHandle)).toBe(true);
      expect(session.state.up[seat]!.every((card) => !isVeilHandle(card))).toBe(true);
    }
    const upFlat = session.state.up.flat().sort();
    expect(upFlat).toEqual([...opened].sort());
  });

  it('keeps the open-room deal untouched when Veil is off', () => {
    const open = createSession(palaceGame, { seed: 71, config: DEFAULTS, seats: SEATS });
    expect(open.state.hands.flat().every((card) => !isVeilHandle(card))).toBe(true);
    expect(open.state.down.flat().every((card) => !isVeilHandle(card))).toBe(true);
  });

  it('plays an opened hand card through the ordinary move with meta reveals', () => {
    const { session } = veiledSession();
    // Every seat may attempt the opening lead under Veil (the starter falls
    // back to a seeded random seat — the state cannot compare hidden hands).
    const opener = session.state.turn!;
    const handle = session.state.hands[opener]![0]!;
    const usedFaces = new Set(session.state.up.flat());
    const face = ordinaryUnusedFace(usedFaces)!;
    const outcome = sessionApply(
      palaceGame,
      session,
      opener,
      'playCards',
      { cards: [face] },
      {
        reveals: [[handle, face]],
      },
    );
    expect(outcome.rejected, outcome.rejected?.message).toBeUndefined();
    const next = outcome.session!;
    expect(next.state.pile).toEqual([face]);
    expect(next.state.hands[opener]!.every((card) => isVeilHandle(card) || card !== face)).toBe(
      true,
    );
  });

  it('rejects a play whose payload was never opened instead of crashing', () => {
    const { session } = veiledSession();
    const opener = session.state.turn!;
    const outcome = sessionApply(palaceGame, session, opener, 'playCards', { cards: ['S5'] });
    expect(outcome.rejected?.code).toBe('illegal-move');
  });

  it('will not deal the next round from the session rng', () => {
    const { session } = veiledSession();
    // Force a round win so the table is waiting on a redeal.
    const ended: GameSession<PalaceState, PalaceRules> = {
      ...session,
      state: { ...session.state, roundWinner: 0, turn: null },
    };
    const outcome = sessionInject(palaceGame, ended, 'nextRound', undefined);
    expect(outcome.rejected?.code).toBe(VEILED_REDEAL_PENDING);
    expect(palaceGame.veil!.redealMove).toBe('nextRound');
  });

  it('deals the next round from the deck a fresh ceremony produced', () => {
    const { session } = veiledSession();
    const ended: GameSession<PalaceState, PalaceRules> = {
      ...session,
      state: { ...session.state, roundWinner: 0, turn: null },
    };
    const nextOrder = veiledDeckOrder(palaceGame.veil!, SEATS, openedUp(SEATS), DEFAULTS);
    const outcome = sessionInject(palaceGame, ended, 'nextRound', { deckOrder: nextOrder });
    expect(outcome.rejected, outcome.rejected?.message).toBeUndefined();
    const dealt = outcome.session.state;
    expect(dealt.round).toBe(session.state.round + 1);
    for (let seat = 0; seat < SEATS; seat++) {
      expect(dealt.up[seat]).toHaveLength(3);
      expect(dealt.up[seat]!.every((card) => !isVeilHandle(card))).toBe(true);
    }
  });

  it('hashes identically across peers while veiled', () => {
    const { session, deckOrder } = veiledSession();
    const opener = session.state.turn!;
    const handle = session.state.hands[opener]![0]!;
    const usedFaces = new Set(session.state.up.flat());
    const face = ordinaryUnusedFace(usedFaces)!;
    const reveal: [CardId, CardId] = [handle, face];
    const host = sessionApply(
      palaceGame,
      session,
      opener,
      'playCards',
      { cards: [face] },
      {
        reveals: [reveal],
      },
    ).session!;

    const guestSession = createSession(palaceGame, {
      seed: 71,
      config: DEFAULTS,
      seats: SEATS,
      veiled: true,
      deckOrder,
    });
    const guestApplied = sessionApply(
      palaceGame,
      guestSession,
      opener,
      'playCards',
      { cards: [face] },
      {
        reveals: [reveal],
      },
    ).session!;
    expect(guestApplied.lastAppliedHash).toBe(host.log[host.log.length - 1]!.hash);
    expect(stateHash(guestApplied.state)).toBe(stateHash(host.state));
  });
});

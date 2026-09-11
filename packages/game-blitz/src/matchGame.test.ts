import { describe, expect, it } from 'vitest';
import {
  createSession,
  replaySession,
  sessionApply,
  sessionInject as engineInject,
  stateHash,
  veiledDeckOrder,
  type GameSession,
} from '@parlour/engine';
import { blitzConfigSchema, type BlitzConfig } from './config';
import { createBlitzMatchDef, matchEndResult } from './matchGame';
import type { BlitzMatchState } from './state';

/*
 * A friend room is one replicated session, so a Blitz *match* — three lives
 * each, played round after round until one seat is left — has to fit inside one
 * game def. Rooms used to run the round def instead: they played a single deal,
 * nobody's lives ever moved, and the podium got one hand's values.
 *
 * These are about the match layer, not the round: that lives are banked, that
 * the next round is dealt, that eliminated seats stay out, and that the result
 * handed to the podium is a match score every peer derives identically.
 */

const def = createBlitzMatchDef();
const DEFAULTS = blitzConfigSchema.defaults();

type MatchSession = GameSession<BlitzMatchState, BlitzConfig>;

function open(seats = 3, seed = 7): MatchSession {
  return createSession(def, { seed, config: DEFAULTS, seats });
}

function sessionInject(session: MatchSession, move: string, payload?: unknown) {
  return engineInject(def, session, move, payload);
}

function play(session: MatchSession, seat: number, move: string, payload?: unknown): MatchSession {
  const outcome = sessionApply(def, session, seat, move, payload);
  if (outcome.rejected) throw new Error(`${move} rejected: ${outcome.rejected.code}`);
  return outcome.session;
}

function acting(
  session: MatchSession,
): { seat: number; legal: readonly { id: string; payload?: unknown }[] } | null {
  const seat = session.phase.actor;
  if (seat === null || session.status !== 'playing') return null;
  const legal = def.flow.legalMovesFor!(session.state, session.phase, seat);
  return legal.length === 0 ? null : { seat, legal };
}

/**
 * Drives with knock-as-soon-as-legal so rounds finish in a handful of turns
 * rather than by exhausting the stock.
 */
function step(session: MatchSession): MatchSession {
  const next = acting(session);
  if (!next) throw new Error(`nobody to act in phase ${session.phase.phase}`);
  const knock = next.legal.find((move) => move.id === 'knock');
  const choice = knock ?? next.legal[0]!;
  return play(session, next.seat, choice.id, choice.payload);
}

/** Plays on until the live round has been banked, or the match ends. */
function toRoundEnd(session: MatchSession, guardMax = 500): MatchSession {
  let cursor = session;
  let guard = 0;
  while (cursor.status === 'playing' && !cursor.state.folded) {
    if (guard++ > guardMax) throw new Error('round never folded');
    cursor = step(cursor);
  }
  return cursor;
}

describe('the Blitz match as one session', () => {
  it('deals a first round and starts everyone on three lives', () => {
    const session = open();
    expect(session.state.lives).toEqual([3, 3, 3]);
    expect(session.state.roundIndex).toBe(0);
    expect(session.state.round.hands.every((hand) => hand.length === 3)).toBe(true);
    expect(matchEndResult(session.state)).toBeNull();
  });

  it('banks a life off the losing seats and does not end the match there', () => {
    const folded = toRoundEnd(open());
    expect(folded.status).toBe('playing');
    expect(folded.state.folded).toBe(true);
    expect(folded.state.lastOutcome).not.toBeNull();

    const lost = folded.state.lives.filter((lives) => lives < 3).length;
    expect(lost).toBeGreaterThan(0);
    // A three-seat table cannot be decided by one round: somebody still has
    // lives, so the match is not over and the podium is not owed a result.
    expect(matchEndResult(folded.state)).toBeNull();
  });

  it('deals the next round once the table has readied up', () => {
    let session = toRoundEnd(open());
    const livesAfterFirst = session.state.lives;
    expect(session.phase.phase).toBe('round-end');

    for (let seat = 0; seat < 3; seat++) session = play(session, seat, 'ready');

    expect(session.state.roundIndex).toBe(1);
    expect(session.state.folded).toBe(false);
    expect(session.phase.phase).not.toBe('round-end');
    // A fresh deal, with the standings carried into it.
    expect(session.state.lives).toEqual(livesAfterFirst);
    expect(session.state.round.outcome).toBeNull();
  });

  it('plays round after round until one seat is left standing', () => {
    let session = open(3, 11);
    let rounds = 0;
    while (session.status === 'playing') {
      if (rounds++ > 60) throw new Error('match never reached a winner');
      session = toRoundEnd(session);
      if (session.status !== 'playing') break;
      for (let seat = 0; seat < 3; seat++) {
        if (session.status !== 'playing' || !session.state.folded) break;
        session = play(session, seat, 'ready');
      }
    }

    expect(session.status).toBe('ended');
    expect(rounds).toBeGreaterThan(1);
    const standing = session.state.lives.filter((lives) => lives > 0);
    expect(standing.length).toBeLessThanOrEqual(1);
  });

  it('deals nothing to a knocked-out seat, and never asks it to act', () => {
    // Drive a two-seat table, where one round can settle the whole thing.
    let session = open(2, 23);
    while (session.status === 'playing') {
      session = toRoundEnd(session);
      if (session.status !== 'playing') break;
      const out = session.state.lives.flatMap((lives, seat) => (lives <= 0 ? [seat] : []));
      for (let seat = 0; seat < 2; seat++) {
        if (session.status !== 'playing' || !session.state.folded) break;
        session = play(session, seat, 'ready');
      }
      if (session.status !== 'playing') break;
      for (const seat of out) {
        expect(session.state.round.hands[seat]).toEqual([]);
        expect(session.state.round.out).toContain(seat);
        expect(def.flow.legalMovesFor!(session.state, session.phase, seat)).toEqual([]);
      }
    }
    expect(session.status).toBe('ended');
  });

  /*
   * The podium reads its figures out of `detail`, and both peers derive the
   * result from the same replicated log. A round's hand values — which is what
   * a room used to report — say nothing about the match and differ the moment
   * one peer can read a hand the other cannot.
   */
  it('ends with a match score for every seat, not one round of hand values', () => {
    let session = open(3, 11);
    while (session.status === 'playing') {
      session = toRoundEnd(session);
      if (session.status !== 'playing') break;
      for (let seat = 0; seat < 3; seat++) {
        if (session.status !== 'playing' || !session.state.folded) break;
        session = play(session, seat, 'ready');
      }
    }

    const result = session.result;
    expect(result).not.toBeNull();
    expect(result!.rankings).toHaveLength(3);
    for (const rank of result!.rankings) {
      expect(rank.detail).toHaveProperty('livesLeft');
      expect(rank.detail).toHaveProperty('blitzes');
      expect(rank.detail).toHaveProperty('knockWins');
      expect(rank.detail!.livesLeft).toBe(session.state.lives[rank.seat]);
    }
    expect(result!.reason).toMatch(/last player standing|simultaneous knockout/);
  });

  it('replays to the same state, so two peers on the same log agree', () => {
    let session = toRoundEnd(open(3, 11));
    for (let seat = 0; seat < 3; seat++) session = play(session, seat, 'ready');
    session = toRoundEnd(session);

    const replayed = replaySession(def, session.seed, session.log, {
      config: DEFAULTS,
      seats: 3,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.state.lives).toEqual(session.state.lives);
  });

  it('refuses to deal again while the match is over', () => {
    let session = open(2, 23);
    while (session.status === 'playing') {
      session = toRoundEnd(session);
      if (session.status !== 'playing') break;
      for (let seat = 0; seat < 2; seat++) {
        if (session.status !== 'playing' || !session.state.folded) break;
        session = play(session, seat, 'ready');
      }
    }
    const verdict = def.moves['next.round']!.validate(session.state, 0, undefined);
    expect(verdict).not.toBe(true);
    expect(verdict).toMatchObject({ code: 'no-next-round' });
  });

  describe('under Veil', () => {
    /*
     * A veiled deal is one shuffle ceremony over one deck, so the match cannot
     * deal itself a second round — it has to ask, and the room answers with a
     * fresh deck. Getting this wrong is exactly how a private match ends after
     * one round, which is the bug this whole def exists to fix.
     */
    const STARTER = 'H7';

    function veiledOrder(seats: number) {
      return veiledDeckOrder(def.veil!, seats, [STARTER], DEFAULTS);
    }

    it('opens the starting discard at the index the ceremony opened', () => {
      const session = createSession(def, {
        seed: 5,
        config: DEFAULTS,
        seats: 3,
        veiled: true,
        deckOrder: veiledOrder(3),
      });
      expect(session.state.veiled).toBe(true);
      expect(session.state.round.discard).toEqual([STARTER]);
      expect(session.state.round.hands.flat().every((card) => card.startsWith('v#'))).toBe(true);
    });

    it('asks the room for a deck rather than dealing itself one', () => {
      // Playing a veiled round to its showdown needs the room's reveal
      // ceremony, which is not what this is about: what matters is what the
      // match does once a round HAS folded and every seat is ready.
      const base = createSession(def, {
        seed: 5,
        config: DEFAULTS,
        seats: 3,
        veiled: true,
        deckOrder: veiledOrder(3),
      });
      const ready: BlitzMatchState = { ...base.state, folded: true, readied: [0, 1, 2] };

      // An open table would deal itself the next round here. A veiled one says
      // what it is waiting for instead, which is the host's cue to shuffle.
      expect(def.moves['next.round']!.validate(ready, 0, undefined)).toMatchObject({
        code: 'no-veiled-deck',
      });

      // The room injects it, as a system event carrying the ceremony's deck.
      const injected = sessionInject({ ...base, state: ready }, 'next.round', {
        deckOrder: veiledOrder(3),
      });
      const session = injected.session;
      expect(injected.rejected).toBeUndefined();
      expect(session.state.roundIndex).toBe(1);
      expect(session.state.round.discard).toEqual([STARTER]);
      expect(session.state.folded).toBe(false);
    });

    it('keeps the public opening on its deck index after an elimination', () => {
      // The ceremony opens deck position `seats × 3` whatever the standings, so
      // a deal that skipped an eliminated seat's three cards would flip a
      // handle nobody can read onto the discard.
      const state = createSession(def, {
        seed: 5,
        config: DEFAULTS,
        seats: 3,
        veiled: true,
        deckOrder: veiledOrder(3),
      }).state;
      const folded: BlitzMatchState = {
        ...state,
        folded: true,
        lives: [0, 3, 3],
        readied: [0, 1, 2],
      };
      const dealt = def.moves['next.round']!.apply(folded, 0, { deckOrder: veiledOrder(3) }, {
        rng: { next: () => 0 },
        fx: { emit: () => undefined },
        event: {},
      } as never);
      expect(dealt.round.discard).toEqual([STARTER]);
      expect(dealt.round.hands[0]).toEqual([]);
    });
  });
});

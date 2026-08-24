import { describe, expect, it } from 'vitest';
import { applyPreset, createSession, sessionApply, type GameSession } from '@parlour/engine';
import { createPokerDef, type PokerRules, type PokerState } from '@parlour/game-poker';
import { pokerTableView, type PokerSnapshot } from './view';

const def = createPokerDef();

function openSession(seats = 4, seed = 42): GameSession<PokerState, PokerRules> {
  return createSession(def, {
    seed,
    config: applyPreset(def.configSchema, 'classic'),
    seats,
  });
}

function snapshotOf(session: GameSession<PokerState, PokerRules>): PokerSnapshot {
  return {
    mode: 'classic',
    players: Array.from({ length: session.state.seats }, (_, seat) => ({
      seat,
      name: seat === 0 ? 'You' : `Bot ${seat}`,
      avatarId: 'ember',
      isBot: seat !== 0,
    })),
    session,
    won: null,
  };
}

function legalFor(session: GameSession<PokerState, PokerRules>, seat: number) {
  return def.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
}

describe('the poker table view', () => {
  it('marks the button and the blinds', () => {
    const session = openSession();
    const view = pokerTableView(snapshotOf(session), [], 0);
    expect(view.players.find((player) => player.isButton)?.seat).toBe(0);
    expect(view.players.find((player) => player.isSmallBlind)?.seat).toBe(1);
    expect(view.players.find((player) => player.isBigBlind)?.seat).toBe(2);
    expect(view.smallBlind).toBe(10);
    expect(view.bigBlind).toBe(20);
  });

  it("never turns another seat's cards face up before showdown", () => {
    const session = openSession();
    const view = pokerTableView(snapshotOf(session), [], 0);
    const me = view.players[0]!;
    const them = view.players[1]!;
    expect(me.holeFaceUp).toBe(true);
    expect(me.hole).toHaveLength(2);
    expect(them.holeFaceUp).toBe(false);
    expect(them.hole).toEqual(['??', '??']);
    expect(view.hand).toHaveLength(2);
  });

  it('offers no action while another seat is thinking', () => {
    const session = openSession();
    // Seat 3 acts first four-handed, so seat 0 has nothing to do yet.
    expect(session.state.turn).toBe(3);
    expect(pokerTableView(snapshotOf(session), [], 0).action).toBeNull();
  });

  it("describes the action when it is this seat's turn", () => {
    const session = openSession();
    const seat = session.state.turn as number;
    const view = pokerTableView(snapshotOf(session), legalFor(session, seat), seat);
    expect(view.action).not.toBeNull();
    expect(view.action!.canFold).toBe(true);
    expect(view.action!.canCall).toBe(true);
    expect(view.action!.canCheck).toBe(false);
    expect(view.action!.callAmount).toBe(20);
    expect(view.action!.raiseVerb).toBe('raise');
    expect(view.action!.minRaiseTo).toBe(40);
    expect(view.action!.maxRaiseTo).toBe(3000);
  });

  it('names the raise ladder in table language', () => {
    const session = openSession();
    const seat = session.state.turn as number;
    const view = pokerTableView(snapshotOf(session), legalFor(session, seat), seat);
    const labels = view.action!.raiseOptions.map((option) => option.label);
    expect(labels[0]).toBe('Min');
    expect(labels[labels.length - 1]).toBe('All in');
    // Every offered amount sits inside the legal band.
    for (const option of view.action!.raiseOptions) {
      expect(option.to).toBeGreaterThanOrEqual(view.action!.minRaiseTo);
      expect(option.to).toBeLessThanOrEqual(view.action!.maxRaiseTo);
    }
  });

  it('reports what a seat just did, and forgets it on the next street', () => {
    let session = openSession();
    const seat = session.state.turn as number;
    session = sessionApply(def, session, seat, 'call').session;
    const afterCall = pokerTableView(snapshotOf(session), [], 0);
    expect(afterCall.players[seat]!.lastAction).toBe('Call 20');

    // Blinds are still this street's news; a preflop call is not, once the
    // flop is out.
    expect(afterCall.players[2]!.lastAction).toBe('Blind 20');
  });

  it('counts the pot as everything in the middle', () => {
    const session = openSession();
    const view = pokerTableView(snapshotOf(session), [], 0);
    // Small blind, big blind, and the big blind's table ante.
    expect(view.pot).toBe(10 + 20 + 0);
  });

  it('shows the street and an empty board before the flop', () => {
    const view = pokerTableView(snapshotOf(openSession()), [], 0);
    expect(view.street).toBe('preflop');
    expect(view.streetLabel).toBe('Before the flop');
    expect(view.board).toEqual([]);
    expect(view.handLabel).toBeNull();
    expect(view.bestFive).toEqual([]);
  });

  it('names the local hand and its five cards once a board exists', () => {
    let session = openSession(2, 91);
    let guard = 0;
    while (session.state.board.length < 3 && session.status === 'playing') {
      if (guard++ > 40) throw new Error('never reached a flop');
      const seat = session.state.turn as number;
      const legal = legalFor(session, seat);
      const move =
        legal.find((entry) => entry.id === 'check') ??
        legal.find((entry) => entry.id === 'call') ??
        legal[0]!;
      session = sessionApply(def, session, seat, move.id, move.payload).session;
    }
    const view = pokerTableView(snapshotOf(session), [], 0);
    expect(view.board.length).toBeGreaterThanOrEqual(3);
    expect(view.handLabel).toBeTruthy();
    expect(view.bestFive).toHaveLength(5);
  });
});

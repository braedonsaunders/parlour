import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { HeartsTransport } from './HeartsTransport';
import { heartsTableView } from '@/lib/hearts/view';

function makeTransport(mode: 'classic' | 'quickcut' | 'cutthroat' = 'classic', seed = 31) {
  return new HeartsTransport({ mode, seed, player: { name: 'You', avatarId: 'ember' } });
}

describe('HeartsTransport solo match', () => {
  it.each(['classic', 'quickcut', 'cutthroat'] as const)(
    'deals a deterministic %s hand to four seats',
    (mode) => {
      const transport = makeTransport(mode);
      const initial = transport.getSnapshot();
      expect(initial.mode).toBe(mode);
      expect(initial.players).toHaveLength(4);
      expect(initial.players.slice(1).every((player) => player.isBot)).toBe(true);
      expect(initial.hand.state.hands.every((hand) => hand.length === 13)).toBe(true);
      expect(initial.hand.setupFx?.some((event) => event.kind === Fx.DealCard)).toBe(true);
      expect(initial.matchWinner).toBeNull();

      const rerun = makeTransport(mode);
      expect(rerun.getSnapshot().hand.state).toEqual(initial.hand.state);
    },
  );

  it('opens in the pass phase with the human owing three cards', () => {
    const transport = makeTransport();
    expect(transport.humanPending()).toBe(true);
    const legal = transport.legalMovesForSeat(0);
    expect(legal.map((move) => move.id)).toContain('passCards');
  });

  it('rejects malformed passes without touching the log', () => {
    const transport = makeTransport();
    const before = transport.getSnapshot().hand.log.length;
    expect(transport.dispatch('passCards', { cards: ['H1'] }).rejected).not.toBeNull();
    expect(transport.getSnapshot().hand.log).toHaveLength(before);
  });

  it('plays an entire multi-hand match through bots and ranks the match', () => {
    const transport = makeTransport('quickcut', 77);

    let guard = 0;
    while (transport.getSnapshot().status !== 'ended') {
      if (guard++ >= 20_000) throw new Error('match did not finish within 20k actions');
      const snapshot = transport.getSnapshot();
      if (snapshot.status === 'round-over') {
        const next = transport.startNextHand();
        if (next.rejected) throw new Error(next.rejected.code);
        continue;
      }
      if (!transport.humanPending()) {
        transport.playBotTurn();
        continue;
      }
      if (snapshot.hand.state.passing && snapshot.hand.state.selections[0] === null) {
        const hand = [...(snapshot.hand.state.hands[0] ?? [])].sort();
        const outcome = transport.dispatch('passCards', {
          cards: [hand[0]!, hand[1]!, hand[2]!],
        });
        if (outcome.rejected) throw new Error(outcome.rejected.code);
        continue;
      }
      const card = transport
        .legalMovesForSeat(0)
        .filter((move) => move.id === 'playCard')
        .map((move) => (move.payload as { card: string }).card)
        .sort((a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10))[0];
      if (!card) break;
      const outcome = transport.dispatch('playCard', { card });
      if (outcome.rejected) throw new Error(outcome.rejected.code);
    }

    const final = transport.getSnapshot();
    expect(final.matchWinner).not.toBeNull();
    expect(final.scores.some((score) => score >= 50)).toBe(true);
    expect(final.matchResult?.reason).toBe('game-over');
    // the winner is (one of) the lowest totals
    const best = Math.min(...final.scores);
    expect(final.scores[final.matchWinner!]).toBe(best);
  });

  it('emits the pass reveal fx only when the wall drops', () => {
    const transport = makeTransport('classic', 5);
    // three bots pick first (seat order), then the human's drop reveals all four
    let revealFx = null;
    for (let index = 0; index < 4 && !revealFx; index++) {
      if (transport.humanPending()) {
        const state = transport.getSnapshot().hand.state;
        const hand = [...(state.hands[0] ?? [])].sort();
        const outcome = transport.dispatch('passCards', {
          cards: [hand[0]!, hand[1]!, hand[2]!],
        });
        if (outcome.rejected) throw new Error(outcome.rejected.code);
        revealFx = outcome.fx.find((event) => event.kind === 'hearts.pass.reveal') ?? null;
        continue;
      }
      const outcome = transport.playBotTurn();
      revealFx = outcome.fx.find((event) => event.kind === 'hearts.pass.reveal') ?? null;
    }
    expect(revealFx).not.toBeNull();
    const transfers = (revealFx!.payload as { transfers: unknown[] }).transfers;
    expect(transfers).toHaveLength(4);
  });
});

describe('heartsTableView', () => {
  it('surfaces pass state, trick cards and legality to the screen', () => {
    const transport = makeTransport('classic', 9);
    const snapshot = transport.getSnapshot();
    const view = heartsTableView({
      mode: snapshot.mode,
      localSeat: 0,
      players: snapshot.players,
      scores: snapshot.scores,
      state: snapshot.hand.state,
      legal: transport.legalMovesForSeat(0),
    });
    expect(view.decision).toBe('pass');
    expect(view.awaitingPass).toHaveLength(4);
    expect(view.trick).toEqual([]);
    expect(view.players.every((player) => player.score === 0)).toBe(true);
    expect(view.phaseLabel).toContain('passing left');
  });

  it('marks playable cards only when it is the local turn', () => {
    const transport = makeTransport('hold-hand' in {} ? 'classic' : 'classic', 11);
    let snapshot = transport.getSnapshot();
    // run the pass via dispatch then check play-phase view on the human's turn
    while (snapshot.hand.state.passing) {
      const seat = snapshot.hand.state.selections.findIndex((picked) => picked === null);
      const hand = [...(snapshot.hand.state.hands[seat] ?? [])].sort();
      const cards = [hand[0]!, hand[1]!, hand[2]!];
      const outcome =
        seat === 0
          ? transport.dispatch('passCards', { cards })
          : transport.playBotTurn();
      if (outcome.rejected) throw new Error(outcome.rejected.code);
      snapshot = transport.getSnapshot();
    }
    const isHumanTurn = snapshot.hand.state.turn === 0;
    const view = heartsTableView({
      mode: snapshot.mode,
      localSeat: 0,
      players: snapshot.players,
      scores: snapshot.scores,
      state: snapshot.hand.state,
      legal: isHumanTurn ? transport.legalMovesForSeat(0) : [],
    });
    if (isHumanTurn) {
      expect(view.decision).toBe('play');
      expect(view.playableCards).toEqual(['C2']);
      expect(view.trick).toHaveLength(0);
    } else {
      expect(view.decision).toBeNull();
      expect(view.playableCards).toEqual([]);
    }
  });
});

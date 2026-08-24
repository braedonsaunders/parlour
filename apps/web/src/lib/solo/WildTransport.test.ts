import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { WildTransport } from './WildTransport';
import { wildTableView } from '@/lib/wild/view';

function makeTransport(mode: 'classic' | 'party' = 'party', seed = 31, seats: 2 | 3 | 4 = 3) {
  return new WildTransport({ mode, seats, seed, player: { name: 'You', avatarId: 'ember' } });
}

describe('WildTransport M5 acceptance', () => {
  it.each(['classic', 'party'] as const)(
    'deals a deterministic solo %s match through the unchanged engine API',
    (mode) => {
      const transport = makeTransport(mode);

      const initial = transport.getSnapshot();
      expect(initial.mode).toBe(mode);
      expect(initial.players).toHaveLength(3);
      expect(initial.players.slice(1).every((player) => player.isBot)).toBe(true);
      expect(initial.session.state.hands.every((hand) => hand.length === 7)).toBe(true);
      expect(initial.session.state.rules).toMatchObject({
        stackDrawTwo: mode === 'party',
        stackDrawFour: mode === 'party',
        jumpIn: mode === 'party',
      });
      expect(initial.session.setupFx?.some((event) => event.kind === Fx.DealCard)).toBe(true);
      expect(initial.matchWinner).toBeNull();

      const rerun = makeTransport(mode);
      expect(rerun.getSnapshot().session.state).toEqual(initial.session.state);
    },
  );

  it('offers the human seat playCard/draw and applies moves through sessionApply', () => {
    const transport = makeTransport('classic');
    const legal = transport.legalMoves();
    expect(legal.some((move) => move.id === 'draw')).toBe(true);

    const play = legal.find((move) => move.id === 'playCard');
    const outcome = play
      ? transport.dispatch('playCard', play.payload)
      : transport.dispatch('draw');
    expect(outcome.rejected).toBeNull();
    expect(outcome.fx.length).toBeGreaterThan(0);
    expect(transport.getSnapshot().session.log.length).toBe(1);
  });

  it('fails closed on illegal moves without touching the log', () => {
    const transport = makeTransport('classic');
    const outcome = transport.dispatch('playCard', { card: 'red-99-0' });
    expect(outcome.rejected).not.toBeNull();
    expect(transport.getSnapshot().session.log).toHaveLength(0);
  });

  it('bots finish an entire deal and produce a ranked match result', () => {
    const transport = makeTransport('party', 7, 3);

    let guard = 0;
    while (transport.getSnapshot().session.status === 'playing') {
      if (guard++ >= 2000) throw new Error('game did not finish within 2000 actions');
      const snapshot = transport.getSnapshot();
      if (snapshot.session.phase.actor === 0) {
        const legal = transport.legalMoves();
        const choice = legal[0]!;
        const applied = transport.dispatch(choice.id, choice.payload);
        expect(applied.rejected).toBeNull();
      } else {
        transport.playBotsUntilHuman();
      }
    }

    const finished = transport.getSnapshot();
    expect(finished.matchWinner).not.toBeNull();
    expect(finished.session.result?.rankings).toHaveLength(3);
    expect(finished.session.result?.reason).toBe('hand-emptied');
    expect(
      finished.session.result?.rankings.find((r) => r.seat === finished.matchWinner)?.detail,
    ).toMatchObject({ cards: 0 });
  });

  it('rejects play after the match has ended', () => {
    const transport = makeTransport('party', 7, 3);
    let guard = 0;
    while (transport.getSnapshot().session.status === 'playing') {
      if (guard++ >= 2000) throw new Error('game did not finish within 2000 actions');
      if (transport.getSnapshot().session.phase.actor === 0) {
        const choice = transport.legalMoves()[0]!;
        transport.dispatch(choice.id, choice.payload);
      } else {
        transport.playBotsUntilHuman();
      }
    }
    expect(transport.legalMoves()).toHaveLength(0);
    expect(transport.dispatch('draw').rejected?.code).toBe('match-ended');
  });
});

describe('wildTableView', () => {
  it('maps snapshots into a render model with the local hand and legal actions', () => {
    const transport = makeTransport('classic', 31, 3);
    const view = wildTableView(transport.getSnapshot(), transport.legalMoves());

    expect(view.players).toHaveLength(3);
    expect(view.players[0]).toMatchObject({ seat: 0, isLocal: true, handCount: 7 });
    expect(view.hand).toHaveLength(7);
    expect(view.discard.length).toBeGreaterThan(0);
    expect(view.stockCount).toBeGreaterThan(0);
    expect(view.direction).toBe(1);
    expect(view.decision).toBe('play');
    expect(view.legal.draw).toBe(true);
    expect(view.legal.chooseColor).toBe(false);
    for (const card of view.legal.playCards) expect(view.hand).toContain(card);
  });

  it('hides legal actions while a bot is acting', () => {
    const transport = makeTransport('classic', 31, 3);
    const first = transport.legalMoves()[0]!;
    transport.dispatch(first.id, first.payload);
    const snapshot = transport.getSnapshot();
    if (snapshot.session.phase.actor !== 0) {
      const view = wildTableView(snapshot, []);
      expect(view.decision).toBeNull();
      expect(view.legal.playCards).toHaveLength(0);
      expect(view.legal.draw).toBe(false);
    }
  });

  it('surfaces the color decision after the human plays a wild', () => {
    // Sweep seeds until the human holds a wild on turn one — deterministic per seed.
    for (let seed = 1; seed < 200; seed++) {
      const transport = makeTransport('classic', seed, 2);
      const wild = transport
        .legalMoves()
        .find(
          (move) =>
            move.id === 'playCard' &&
            String((move.payload as { card?: unknown }).card).startsWith('wild'),
        );
      if (!wild) continue;
      const outcome = transport.dispatch('playCard', wild.payload);
      expect(outcome.rejected).toBeNull();
      const view = wildTableView(transport.getSnapshot(), transport.legalMoves());
      expect(view.decision).toBe('choose-color');
      expect(view.legal.chooseColor).toBe(true);
      expect(view.legal.draw).toBe(false);

      const chosen = transport.dispatch('chooseColor', { color: 'blue' });
      expect(chosen.rejected).toBeNull();
      expect(transport.getSnapshot().session.state.activeColor).toBe('blue');
      return;
    }
    throw new Error('no seed under 200 dealt the human a wild opener');
  });
});

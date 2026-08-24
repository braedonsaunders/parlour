import { Fx } from '@parlour/engine';
import { cribbageConfigSchema } from '@parlour/game-cribbage';
import { describe, expect, it } from 'vitest';
import { cribbageTableView } from '@/lib/cribbage/view';
import { CribbageTransport } from './CribbageTransport';

function makeTransport(seed = 31, gamesToWin = 1) {
  return new CribbageTransport({
    mode: gamesToWin > 1 ? 'match-play' : 'classic-pub',
    botTier: 2,
    seed,
    player: { name: 'You', avatarId: 'cobalt' },
    rules: cribbageConfigSchema.resolve({ gamesToWin }),
  });
}

describe('CribbageTransport', () => {
  it('deals a deterministic two-seat match and exposes all fifteen crib throws', () => {
    const transport = makeTransport();
    const initial = transport.getSnapshot();
    expect(initial.players).toHaveLength(2);
    expect(initial.match.round.state.hands.map((hand) => hand.length)).toEqual([6, 6]);
    expect(initial.match.round.setupFx?.filter((event) => event.kind === Fx.DealCard)).toHaveLength(
      12,
    );
    expect(transport.legalMoves()).toHaveLength(15);
    expect(new Set(transport.legalMoves().map((move) => move.id))).toEqual(
      new Set(['crib.discard']),
    );
    expect(makeTransport().getSnapshot().match.round.state).toEqual(initial.match.round.state);
  });

  it('moves from both crib throws through the cut into pegging', () => {
    const transport = makeTransport();
    const throwMove = transport.legalMoves()[0]!;
    expect(transport.dispatch(throwMove.id, throwMove.payload).rejected).toBeNull();
    expect(transport.humanCanAct()).toBe(false);
    expect(transport.botCanAct()).toBe(true);

    const bot = transport.playBotTurn();
    expect(bot.rejected).toBeNull();
    expect(transport.legalMoves().map((move) => move.id)).toEqual(['cut']);

    const cut = transport.dispatch('cut');
    expect(cut.rejected).toBeNull();
    expect(cut.fx.some((event) => event.kind === Fx.FlipCard)).toBe(true);
    expect(transport.getSnapshot().match.round.state.starter).not.toBeNull();
    expect(transport.botCanAct()).toBe(true);
  });

  it('finishes a best-of-three match against the same deterministic engine clients', () => {
    const transport = makeTransport(72, 2);
    let guard = 0;
    while (transport.getSnapshot().match.status !== 'ended' && guard++ < 14_000) {
      if (transport.humanCanAct()) {
        const choice = transport.legalMoves()[0]!;
        expect(transport.dispatch(choice.id, choice.payload).rejected).toBeNull();
      } else if (transport.botCanAct()) {
        expect(transport.playBotTurn().rejected).toBeNull();
      } else {
        throw new Error(`no action in ${transport.getSnapshot().match.round.phase.phase}`);
      }
    }
    const finished = transport.getSnapshot();
    expect(guard).toBeLessThan(14_000);
    expect(finished.match.result?.reason).toBe('best-of-3');
    expect(Math.max(...finished.match.match.wins)).toBe(2);
  });

  it('maps the current session into the table render model', () => {
    const transport = makeTransport();
    const view = cribbageTableView(transport.getSnapshot(), transport.legalMoves());
    expect(view.localSeat).toBe(0);
    expect(view.hand).toHaveLength(6);
    expect(view.players[1]).toMatchObject({ handCount: 6, score: 0, isBot: true });
    expect(view.legal.discardPairs).toHaveLength(15);
    expect(view.targetGames).toBe(1);
    expect(view.runningCount).toBe(0);
  });
});

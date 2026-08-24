import { createSession, sessionApply, veiledDeckOrder } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import {
  bestPartition,
  createGinMatchDef,
  ginConfigSchema,
  type GinMatchState,
} from '@parlour/game-gin';
import type { GameSession } from '@parlour/engine';
import type { GinSnapshot } from '@/lib/solo/GinTransport';
import { ginTableView } from './view';

const matchDef = createGinMatchDef();
const DEFAULTS = ginConfigSchema.defaults();

const PLAYERS = [
  { seat: 0, name: 'You', avatarId: 'ember', isBot: false },
  { seat: 1, name: 'Steady Marge', avatarId: 'marge', isBot: true },
] as const;

function snapshotOf(session: GameSession<GinMatchState, typeof DEFAULTS>): GinSnapshot {
  return {
    mode: 'classic',
    players: PLAYERS.map((player) => ({ ...player })),
    session,
    matchWinner: null,
  };
}

describe('ginTableView', () => {
  it('surfaces the upcard decision and hides previews behind the veil', () => {
    const deckOrder = veiledDeckOrder(matchDef.veil!, 2, ['S2'], DEFAULTS);
    let session = createSession(matchDef, {
      seed: 21,
      config: DEFAULTS,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    // the non-dealer holds the first option; after they pass it is ours
    session = sessionApply(matchDef, session, 1, 'option.pass').session;
    const view = ginTableView(snapshotOf(session), [{ id: 'option.take' }, { id: 'option.pass' }]);
    expect(view.decision).toBe('option');
    expect(view.legal.takeUpcard).toBe(true);
    expect(view.legal.passUpcard).toBe(true);
    expect(view.upcard).toBe('S2');
    expect(view.meldPreview).toEqual([]);
    expect(view.deadwood).toBeNull();
    expect(view.players.map((player) => player.handCount)).toEqual([10, 10]);
    expect(view.matchTarget).toBe(100);
  });

  it('previews melds, deadwood and knock legality on a live act phase', () => {
    let session = createSession(matchDef, { seed: 31, config: DEFAULTS, seats: 2 });
    session = sessionApply(matchDef, session, 1, 'option.pass').session;
    session = sessionApply(matchDef, session, 0, 'option.pass').session;
    const throwMove = matchDef.flow.legalMovesFor!(session.state, session.phase, 1).find(
      (move) => move.id === 'discard',
    );
    session = sessionApply(matchDef, session, 1, 'discard', throwMove!.payload).session;
    session = sessionApply(matchDef, session, 0, 'draw.stock').session;

    const localHand = session.state.hand.hands[0]!;
    const legal = [
      ...localHand
        .filter((card) => card !== session.state.hand.drawnFromStock)
        .map((card) => ({ id: 'discard', payload: { card } })),
      ...(bestPartition(localHand).deadwood <= 10 ? [{ id: 'knock' }] : []),
    ];
    const view = ginTableView(snapshotOf(session), legal);

    expect(view.decision).toBe('act');
    expect(view.deadwood).toBe(bestPartition(localHand).deadwood);
    expect(view.canKnock).toBe(bestPartition(localHand).deadwood <= 10);
    expect(view.meldPreview.length).toBeGreaterThan(0);
    expect(view.phaseLabel).toBe('Discard or knock');
    expect(view.activeSeat).toBe(0);
    expect(view.players[1]!.dealer).toBe(false);
    expect(view.players[0]!.score).toBe(0);
  });

  it('renders an empty view surface while other seats act', () => {
    const session = createSession(matchDef, { seed: 5, config: DEFAULTS, seats: 2 });
    const view = ginTableView(snapshotOf(session), []);
    expect(view.decision).toBeNull();
    expect(view.legal.takeUpcard).toBe(false);
    expect(view.legal.drawStock).toBe(false);
    expect(view.phaseLabel).toBe('The upcard');
    expect(view.stockCount + view.discard.length).toBeGreaterThan(0);
  });
});

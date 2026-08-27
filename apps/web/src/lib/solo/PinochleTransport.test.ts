import { describe, expect, it } from 'vitest';
import { PinochleTransport } from './PinochleTransport';

function makeTransport(seed = 11) {
  return new PinochleTransport({
    mode: 'classic',
    seed,
    player: { name: 'You', avatarId: 'ember' },
  });
}

function drainBots(transport: PinochleTransport): void {
  transport.playBotsUntilHuman();
}

describe('PinochleTransport solo match', () => {
  it('lets bots confirm meld after trump instead of parking on a null actor', () => {
    const transport = makeTransport(11);
    drainBots(transport);

    let guard = 0;
    while (transport.getSnapshot().session.state.stage === 'bidding') {
      if (guard++ > 12) throw new Error('auction did not finish');
      const legal = transport.legalMoves();
      const bid = legal.find((move) => move.id === 'bid');
      if (bid) transport.dispatch('bid', bid.payload);
      else transport.dispatch('pass');
      drainBots(transport);
    }

    if (transport.getSnapshot().session.state.stage === 'naming-trump') {
      const trump = transport.legalMoves().find((move) => move.id === 'nameTrump');
      expect(trump).toBeDefined();
      transport.dispatch('nameTrump', trump!.payload);
    }

    const afterTrump = transport.getSnapshot().session;
    expect(afterTrump.state.stage).toBe('melding');
    expect(afterTrump.phase.actor).not.toBeNull();
    expect(afterTrump.phase.actors?.length).toBeGreaterThan(0);

    drainBots(transport);
    if (!transport.getSnapshot().session.state.meldConfirmed[0]) {
      expect(transport.legalMoves().some((move) => move.id === 'confirmMeld')).toBe(true);
      transport.dispatch('confirmMeld');
    }

    drainBots(transport);
    const afterMeld = transport.getSnapshot().session;
    expect(afterMeld.state.meldConfirmed.every(Boolean)).toBe(true);
    expect(afterMeld.state.stage).toBe('playing');
  });
});

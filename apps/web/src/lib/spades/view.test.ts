import { describe, expect, it } from 'vitest';
import type { LegalMove } from '@parlour/engine';
import { SpadesTransport } from '@/lib/solo/SpadesTransport';
import { bidLabel, bidToken, spadesTableView, type SpadesSnapshot } from './view';

function tableAtBidding(seed = 5_150) {
  const transport = new SpadesTransport({
    mode: 'quick',
    seed,
    player: { name: 'Bea', avatarId: 'ember' },
    botTier: 2,
  });
  transport.playBotsUntilHuman();
  return transport;
}

function viewOf(transport: SpadesTransport, legal?: readonly LegalMove[]) {
  return spadesTableView(
    transport.getSnapshot() as unknown as SpadesSnapshot,
    legal ?? transport.legalMoves(),
  );
}

describe('spadesTableView', () => {
  it('offers the bid decision with 1..13 ascending and nil available', () => {
    const view = viewOf(tableAtBidding());
    expect(view.decision).toBe('bid');
    expect(view.bidOptions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(view.canBidNil).toBe(true);
    expect(view.legalCards).toEqual([]);
  });

  it('withholds every decision while another seat acts', () => {
    const view = viewOf(tableAtBidding(), []);
    expect(view.decision).toBeNull();
    expect(view.bidOptions).toEqual([]);
    expect(view.canBidNil).toBe(false);
  });

  it('assigns partnerships by seat parity and marks the local seat', () => {
    const view = viewOf(tableAtBidding());
    expect(view.players.map((player) => player.team)).toEqual([0, 1, 0, 1]);
    expect(view.players[0]!.isLocal).toBe(true);
    expect(view.players.filter((player) => player.isLocal)).toHaveLength(1);
  });

  it('names the local partnership "yours" from whichever seat is viewing', () => {
    const transport = tableAtBidding();
    const fromSeatOne = spadesTableView(
      transport.getSnapshot() as unknown as SpadesSnapshot,
      [],
      1,
    );
    expect(fromSeatOne.teams[1].label).toBe('You & partner');
    expect(fromSeatOne.teams[0].label).toBe('Openers');
  });

  it('accumulates the contract as bids land, not only once all four are in', () => {
    const transport = tableAtBidding();
    const before = viewOf(transport).teams[0].contract;
    transport.dispatch('bid', { bid: 4 });
    const after = spadesTableView(transport.getSnapshot() as unknown as SpadesSnapshot, []);
    expect(after.teams[0].contract).toBe(before + 4);
  });

  it('keeps a nil bid out of the contract sum', () => {
    const transport = tableAtBidding();
    const before = viewOf(transport).teams[0].contract;
    transport.dispatch('bidNil');
    const after = spadesTableView(transport.getSnapshot() as unknown as SpadesSnapshot, []);
    expect(after.teams[0].contract).toBe(before);
    expect(after.teams[0].nilSeats).toEqual([{ seat: 0, intact: true }]);
  });

  it('reports spades unbroken at the start of a hand', () => {
    const view = viewOf(tableAtBidding());
    expect(view.spadesBroken).toBe(false);
    expect(view.ledSuit).toBeNull();
    expect(view.trick).toEqual([]);
    expect(view.overtime).toBe(false);
  });

  it('deals thirteen cards to every seat', () => {
    const view = viewOf(tableAtBidding());
    expect(view.hand).toHaveLength(13);
    expect(view.players.map((player) => player.handCount)).toEqual([13, 13, 13, 13]);
  });

  it('surfaces the target score and the bag ledger', () => {
    const view = viewOf(tableAtBidding());
    expect(view.targetScore).toBe(250);
    expect(view.bags).toEqual([0, 0]);
    expect(view.scores).toEqual([0, 0]);
  });

  it('switches to the play decision once bidding closes', () => {
    const transport = tableAtBidding();
    let guard = 0;
    while (transport.getSnapshot().session.state.stage === 'bidding' && guard++ < 20) {
      if (transport.getSnapshot().session.phase.actor === 0) {
        transport.dispatch('bid', { bid: 3 });
      } else {
        transport.playBotTurn();
      }
    }
    transport.playBotsUntilHuman();
    const view = viewOf(transport);
    expect(view.stage).toBe('playing');
    expect(view.decision).toBe('play');
    expect(view.legalCards.length).toBeGreaterThan(0);
    expect(view.legalCards.every((card) => view.hand.includes(card))).toBe(true);
  });

  it('labels the stage from the mode and the live trick count', () => {
    const view = viewOf(tableAtBidding());
    expect(view.stageLabel).toMatch(/^quick · bidding \d of 4$/);
  });
});

describe('bid projection', () => {
  it('renders nil as a word and a number as itself', () => {
    expect(bidLabel(null)).toBe('—');
    expect(bidLabel({ seat: 0, tricks: 4, nil: false })).toBe('4');
    expect(bidLabel({ seat: 0, tricks: 0, nil: true })).toBe('nil');
  });

  it('projects the frozen render_game_to_text token', () => {
    expect(bidToken(null)).toBeNull();
    expect(bidToken({ seat: 1, tricks: 6, nil: false })).toBe(6);
    // A nil must never serialise as 0 — they score completely differently.
    expect(bidToken({ seat: 1, tricks: 0, nil: true })).toBe('nil');
  });
});

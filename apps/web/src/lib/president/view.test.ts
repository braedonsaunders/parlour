import { describe, expect, it } from 'vitest';
import { presidentModeForRules } from './modes';
import { isValidLocalSet, presidentTableView } from './view';
import { PresidentTransport } from '@/lib/solo/PresidentTransport';
import { orderOf, type PresidentRules } from '@parlour/game-president';

function makeTransport(seats = 5) {
  return new PresidentTransport({
    mode: 'classic',
    seats,
    seed: 2026,
    player: { name: 'Host', avatarId: 'ember' },
  });
}

describe('presidentTableView', () => {
  it('renders the joined peer hand and roles from its assigned seat', () => {
    const transport = makeTransport(5);
    const snapshot = transport.getSnapshot();
    const localSeat = 2;
    const view = presidentTableView(snapshot, [], localSeat);

    expect(view.localSeat).toBe(localSeat);
    expect(view.hand).toEqual(snapshot.session.state.hands[localSeat]);
    expect(view.players.find((player) => player.seat === localSeat)?.isLocal).toBe(true);
    expect(view.players.find((player) => player.seat === 0)?.isLocal).toBe(false);
    // no deal has completed — nobody wears a role yet
    expect(view.players.every((player) => player.role === null)).toBe(true);
    expect(view.decision).toBeNull();
  });

  it('surfaces the standing set and pass option on the local turn', () => {
    const transport = makeTransport(4);
    // bring the table around to seat 0
    transport.playBotsUntilHuman();
    const snapshot0 = transport.getSnapshot();
    expect(snapshot0.session.state.turn).toBe(0);
    const hand = snapshot0.session.state.hands[0]!;
    const cards = snapshot0.session.state.standing
      ? // following: use an enumerated legal set
        (
          snapshot0.session.def.flow
            .legalMovesFor?.(snapshot0.session.state, snapshot0.session.phase, 0)
            ?.find((move) => move.id === 'playSet')?.payload as { cards?: string[] } | undefined
        )?.cards
      : // leading: open with the lowest single
        [[...hand].sort((a, b) => orderOf(a) - orderOf(b))[0]!];
    expect(cards).toBeDefined();
    const dispatch = transport.dispatch('playSet', { cards });
    expect(dispatch.rejected).toBeNull();

    // bots answer until the table is back to seat 0
    transport.playBotsUntilHuman();
    const snapshot = transport.getSnapshot();
    const legal =
      snapshot.session.status === 'playing' && snapshot.session.phase.actor === 0
        ? (snapshot.session.def.flow.legalMovesFor?.(
            snapshot.session.state,
            snapshot.session.phase,
            0,
          ) ?? [])
        : [];
    const view = presidentTableView(snapshot, legal);
    if (view.decision === 'lead-or-follow' && view.standing) {
      expect(view.legal.pass).toBe(true);
      // repeating the pile's own rank is not a legal follow
      expect(isValidLocalSet(view, view.standing.cards)).toBe(false);
      // and the enumerated playable cards all outrank the pile
      const floor = view.standing.rank;
      for (const card of view.legal.playableCards) {
        expect(orderOf(card)).toBeGreaterThan(floor);
      }
    } else {
      // the trick closed while the bots answered — seat 0 leads fresh
      expect(view.standing).toBeNull();
    }
  });
});

describe('presidentModeForRules', () => {
  it('maps rule shapes onto the catalog modes', () => {
    expect(presidentModeForRules({ targetPoints: 7 } as PresidentRules)).toBe('rapid');
    expect(presidentModeForRules({ targetPoints: 21 } as PresidentRules)).toBe('marathon');
    expect(presidentModeForRules({ targetPoints: 11 } as PresidentRules)).toBe('classic');
  });
});

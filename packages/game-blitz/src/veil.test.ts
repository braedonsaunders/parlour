import { describe, expect, it } from 'vitest';
import {
  createSession,
  replaySession,
  sessionApply,
  stateHash,
  veiledDeckOrder,
  type CardId,
  type GameSession,
} from '@parlour/engine';
import { blitzConfigSchema, type BlitzConfig } from './config';
import { createBlitzDef, HAND_SIZE } from './rules';
import type { BlitzState } from './state';

const def = createBlitzDef();
const DEFAULTS = blitzConfigSchema.defaults();

type Session = GameSession<BlitzState, BlitzConfig>;

function veiled(seats = 2, starter: CardId = 'S2') {
  const deckOrder = veiledDeckOrder(def.veil!, seats, [starter], DEFAULTS);
  return {
    deckOrder,
    session: createSession(def, {
      seed: 21,
      config: DEFAULTS,
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

/** Every card `seat` holds, opened to a hand that sums to a suited 31. */
function thirtyOne(session: Session, seat: number): [CardId, CardId][] {
  const hand = session.state.hands[seat] ?? [];
  const faces: CardId[] = ['H1', 'H10', 'H11'];
  return hand.map((handle, index) => [handle, faces[index] as CardId] as [CardId, CardId]);
}

describe('blitz under Veil', () => {
  it('deals opaque hands and a public starting discard', () => {
    const { session } = veiled();
    expect(session.state.veiled).toBe(true);
    expect(session.state.hands[0]).toEqual(['v#0', 'v#1', 'v#2']);
    expect(session.state.hands[1]).toEqual(['v#3', 'v#4', 'v#5']);
    expect(session.state.discard).toEqual(['S2']);
    expect(session.state.stock.every((card) => card.startsWith('v#'))).toBe(true);
  });

  it('opens the round instead of ending it, because no seat can read a dealt 31', () => {
    const { session } = veiled();
    expect(session.status).toBe('playing');
    expect(session.result).toBeNull();
  });

  it('keeps every seat able to speak up while keeping the turn to one seat', () => {
    const { session } = veiled(3);
    expect(session.phase.actors).toEqual([0, 1, 2]);
    expect(session.phase.actor).toBe(0);
    expect(def.flow.legalMovesFor!(session.state, session.phase, 1).map((m) => m.id)).toEqual([
      'blitz.claim',
    ]);
    const own = def.flow.legalMovesFor!(session.state, session.phase, 0).map((m) => m.id);
    expect(own).toContain('draw.stock');
    expect(own).toContain('knock');
  });

  it('leaves an open room exactly as it was — no claim moves, no extra actors', () => {
    const open = createSession(def, { seed: 21, config: DEFAULTS, seats: 3 });
    expect(open.state.veiled).toBe(false);
    expect(open.phase.actors).toBeUndefined();
    expect(def.flow.legalMovesFor!(open.state, open.phase, 1)).toEqual([]);
  });
});

describe('blitz claims', () => {
  it('settles a proven claim through the ordinary blitz move', () => {
    const { session } = veiled();
    const outcome = sessionApply(def, session, 1, 'blitz.claim', undefined, {
      reveals: thirtyOne(session, 1),
    });
    expect(outcome.rejected).toBeUndefined();
    expect(outcome.session.status).toBe('ended');
    expect(outcome.session.result?.winner).toBe(1);
    expect(outcome.session.result?.reason).toBe('blitz');
    expect(outcome.fx.some((event) => event.kind === 'burst.blitz')).toBe(true);
  });

  it('leaves the other hands veiled when a claim ends the round', () => {
    const { session } = veiled();
    const ended = sessionApply(def, session, 1, 'blitz.claim', undefined, {
      reveals: thirtyOne(session, 1),
    }).session;
    expect(ended.state.hands[0]).toEqual(['v#0', 'v#1', 'v#2']);
  });

  it('rejects a bluff without letting it into the log', () => {
    const { session } = veiled();
    const hand = session.state.hands[0] ?? [];
    const outcome = sessionApply(def, session, 0, 'blitz.claim', undefined, {
      reveals: [
        [hand[0]!, 'C2'],
        [hand[1]!, 'D5'],
        [hand[2]!, 'H9'],
      ],
    });
    expect(outcome.rejected?.code).toBe('not-a-blitz');
    expect(outcome.events).toEqual([]);
    expect(outcome.session.state.hands[0]).toEqual(hand);
  });

  it('rejects a claim that does not open the whole hand', () => {
    const { session } = veiled();
    const hand = session.state.hands[0] ?? [];
    const outcome = sessionApply(def, session, 0, 'blitz.claim', undefined, {
      reveals: [[hand[0]!, 'H1']],
    });
    expect(outcome.rejected?.code).toBe('claim-not-opened');
  });

  it('refuses claims in an open room, where the table already sees every hand', () => {
    const open = createSession(def, { seed: 21, config: DEFAULTS, seats: 2 });
    expect(sessionApply(def, open, 0, 'blitz.claim').rejected?.code).toBe('illegal-move');
    expect(sessionApply(def, open, 1, 'blitz.claim').rejected?.code).toBe('not-your-turn');
  });
});

describe('veiled showdown', () => {
  function knockThenClose(seats = 2) {
    const { deckOrder, session } = veiled(seats);
    let current: Session = sessionApply(def, session, 0, 'knock').session;
    // Every other seat takes its post-knock turn: draw the public discard, put
    // it straight back. No hidden card ever has to be opened to do it.
    for (let step = 0; step < seats - 1; step++) {
      const seat = current.phase.actor as number;
      current = sessionApply(def, current, seat, 'draw.discard').session;
      const taken = current.state.drawnFromDiscard as CardId;
      const other = (current.state.hands[seat] ?? []).find((card) => card !== taken) as CardId;
      current = sessionApply(def, current, seat, 'discard', { card: other }).session;
    }
    return { deckOrder, session: current };
  }

  it('parks on a reveal phase rather than scoring hands it cannot read', () => {
    const { session } = knockThenClose();
    expect(session.status).toBe('playing');
    expect(session.phase.phase).toBe('showdown.reveal');
    expect(session.phase.actors).toEqual([0, 1]);
    expect(def.flow.legalMovesFor!(session.state, session.phase, 1).map((m) => m.id)).toEqual([
      'showdown.open',
    ]);
  });

  it('scores the round once the last hand comes face up', () => {
    const { session } = knockThenClose();
    const faces = ['C2', 'C4', 'C6', 'D3', 'D5', 'D7', 'H2', 'H4', 'H6'];
    let current = session;
    let cursor = 0;
    for (const seat of [...(current.phase.actors ?? [])]) {
      const reveals = (current.state.hands[seat] ?? [])
        .filter((card) => card.startsWith('v#'))
        .map((handle) => [handle, faces[cursor++] as CardId] as [CardId, CardId]);
      const outcome = sessionApply(def, current, seat, 'showdown.open', undefined, { reveals });
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session;
    }
    expect(current.status).toBe('ended');
    expect(current.result?.reason).toBe('showdown');
    expect(current.state.hands.flat().some((card) => card.startsWith('v#'))).toBe(false);
  });

  it('refuses to open a hand halfway', () => {
    const { session } = knockThenClose();
    const hand = session.state.hands[0] ?? [];
    const outcome = sessionApply(def, session, 0, 'showdown.open', undefined, {
      reveals: [[hand[0]!, 'C2']],
    });
    expect(outcome.rejected?.code).toBe('hand-not-opened');
  });
});

describe('veiled replay', () => {
  it('reproduces a claimed blitz from seed, ceremony order and log alone', () => {
    const { deckOrder, session } = veiled();
    const ended = sessionApply(def, session, 1, 'blitz.claim', undefined, {
      reveals: thirtyOne(session, 1),
    }).session;

    const replayed = replaySession(def, 21, ended.log, {
      config: DEFAULTS,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(ended.state));
    expect(replayed.result?.winner).toBe(1);
    expect(replayed.state.hands[0]).toEqual(['v#0', 'v#1', 'v#2']);
  });

  it('replays a discard, keeping the played card public and the rest hidden', () => {
    const { deckOrder, session } = veiled();
    const drawn = sessionApply(def, session, 0, 'draw.stock').session;
    const handle = (drawn.state.hands[0] ?? [])[1] as CardId;
    const discarded = sessionApply(def, drawn, 0, 'discard', { card: 'C9' }, {
      reveals: [[handle, 'C9']],
    }).session;
    expect(discarded.state.discard[0]).toBe('C9');
    expect(discarded.state.hands[0]).toHaveLength(HAND_SIZE);

    const replayed = replaySession(def, 21, discarded.log, {
      config: DEFAULTS,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(discarded.state));
    expect(replayed.state.hands[1]).toEqual(['v#3', 'v#4', 'v#5']);
  });
});

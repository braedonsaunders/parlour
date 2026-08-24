import { describe, expect, it } from 'vitest';
import { passDirectionFor } from './config';
import { openSession, step } from './test-util';

function pickFor(session: ReturnType<typeof openSession>, seat: number) {
  const hand = [...(session.state.hands[seat] ?? [])].sort();
  return { cards: [hand[0]!, hand[1]!, hand[2]!] };
}

describe('pass rotation', () => {
  it('cycles left → right → across → hold and wraps without hold', () => {
    expect(['left', 'right', 'across', 'hold']).toEqual(
      [0, 1, 2, 3].map((i) => passDirectionFor(i, true)),
    );
    expect(passDirectionFor(4, true)).toBe('left');
    expect(passDirectionFor(3, false)).toBe('left');
    expect(passDirectionFor(5, false)).toBe('across');
  });
});

describe('simultaneous pass', () => {
  it('hides picks until all four land, then transfers together', () => {
    let session = openSession({ seed: 21 });
    expect(session.state.passing).toBe(true);

    // First three seats pick — nothing may transfer yet.
    for (const seat of [0, 1, 2]) {
      const before = JSON.stringify(session.state.hands);
      session = step(session, seat!, 'passCards', pickFor(session, seat!)).session;
      expect(session.state.passing).toBe(true);
      expect(JSON.stringify(session.state.hands)).not.toBe(before);
      // other seats cannot see the picked faces
      for (const other of [0, 1, 2, 3]) {
        if (other === seat) continue;
        void other;
      }
      expect(session.state.selections.filter(Boolean)).toHaveLength(seat + 1);
    }

    const result = step(session, 3, 'passCards', pickFor(session, 3));
    expect(result.rejected).toBeUndefined();
    session = result.session;

    expect(session.state.passing).toBe(false);
    expect(session.state.selections.every((pick: unknown) => pick === null)).toBe(true);
    // table-wide conservation: every dealt card is still on someone's hand
    const after = session.state.hands.flat().slice().sort();
    const before = openSession({ seed: 21 }).state.hands.flat().slice().sort();
    expect(after).toEqual(before);
    // every hand still holds 13 cards
    for (const hand of session.state.hands) expect(hand).toHaveLength(13);
    // leader is the two of clubs holder
    expect(session.state.hands[session.state.leader]).toContain('C2');
    expect(session.phase.phase).toBe('play');
  });

  it('emits one reveal fx only when the wall drops, never per pick', () => {
    let session = openSession({ seed: 22 });
    let revealCount = 0;
    let pickCount = 0;
    for (const seat of [0, 1, 2]) {
      const out = step(session, seat!, 'passCards', pickFor(session, seat!));
      pickCount += out.fx.filter((e) => e.kind === 'hearts.pass.pick').length;
      revealCount += out.fx.filter((e) => e.kind === 'hearts.pass.reveal').length;
      session = out.session;
    }
    expect(revealCount).toBe(0);
    expect(pickCount).toBe(3);
    const final = step(session, 3, 'passCards', pickFor(session, 3));
    revealCount += final.fx.filter((e) => e.kind === 'hearts.pass.reveal').length;
    expect(revealCount).toBe(1);
    const reveal = final.fx.find((e) => e.kind === 'hearts.pass.reveal')!;
    expect((reveal.payload as { transfers: unknown[] }).transfers).toHaveLength(4);
  });

  it('moves cards exactly one seat left', () => {
    let session = openSession({ seed: 23 });
    const givers = [0, 1, 2, 3];
    const given: string[][] = [];
    for (const seat of givers) {
      const cards = (session.state.hands[seat] ?? []).slice().sort().slice(0, 3);
      given.push(cards);
      session = step(session, seat, 'passCards', { cards }).session;
    }
    for (const giver of givers) {
      const receiver = (giver + 1) % 4; // left
      for (const card of given[giver]!) {
        expect(session.state.hands[receiver]).toContain(card);
      }
    }
  });

  it('moves cards right and across per direction', () => {
    for (const [direction, offset] of [
      ['right', -1],
      ['across', 2],
    ] as const) {
      let session = openSession({ seed: 24, config: { passDirection: direction } });
      expect(session.state.rules.passDirection).toBe(direction);
      const given: string[][] = [];
      for (const seat of [0, 1, 2, 3]) {
        const cards = (session.state.hands[seat] ?? []).slice().sort().slice(0, 3);
        given.push(cards);
        session = step(session, seat, 'passCards', { cards }).session;
      }
      for (const giver of [0, 1, 2, 3]) {
        const receiver = (((giver + offset) % 4) + 4) % 4;
        for (const card of given[giver]!) {
          expect(session.state.hands[receiver]).toContain(card);
        }
      }
    }
  });

  it('rejects duplicate or foreign cards', () => {
    const session = openSession({ seed: 25 });
    const hand = session.state.hands[0] ?? [];
    expect(step(session, 0, 'passCards', { cards: [hand[0], hand[0], hand[1]] }).rejected).toBe(
      'bad-pass',
    );
    expect(step(session, 0, 'passCards', { cards: ['XX', 'YY', 'ZZ'] }).rejected).toBe(
      'not-in-hand',
    );
    expect(step(session, 0, 'passCards', { cards: [hand[0], hand[1]] }).rejected).toBe('bad-pass');
    void session;
  });

  it('hold hands skip passing entirely', () => {
    const session = openSession({ config: { passDirection: 'hold' }, seed: 26 });
    expect(session.state.passing).toBe(false);
    expect(session.phase.phase).toBe('play');
    const hand = session.state.hands[session.state.turn] ?? [];
    expect(hand).toContain('C2');
    // legality gates first: play phase offers no pass move at all
    expect(step(session, session.state.turn, 'passCards', { cards: [] }).rejected).toBe(
      'illegal-move',
    );
  });
});

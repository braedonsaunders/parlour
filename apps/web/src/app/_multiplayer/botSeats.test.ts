import { describe, expect, it } from 'vitest';
import {
  createSession,
  defineConfig,
  sessionApply,
  type GameDef,
  type GameSession,
  type RuleValues,
} from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import { botTurnKey, botTurns } from './botSeats';

const def = createBlitzDef();
const CONFIG = blitzConfigSchema.defaults();

function blitz(seats = 3): GameSession<BlitzState, BlitzConfig> {
  return createSession(def, { seed: 808, config: CONFIG, seats });
}

describe('who a bot plays for', () => {
  it('plays the seat whose turn it is when a bot holds it', () => {
    const session = blitz();
    const turns = botTurns({ def, session, view: session.state, botSeats: [0] });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.seat).toBe(0);
    expect(['draw.stock', 'draw.discard', 'knock']).toContain(turns[0]!.move.id);
  });

  it('stays out of the way when the acting seat is a live player', () => {
    const session = blitz();
    expect(botTurns({ def, session, view: session.state, botSeats: [1, 2] })).toEqual([]);
  });

  it('does nothing at a table with no bot seats', () => {
    const session = blitz();
    expect(botTurns({ def, session, view: session.state, botSeats: [] })).toEqual([]);
  });

  it('does nothing once the match is over', () => {
    const session = blitz();
    const ended = { ...session, status: 'ended' as const };
    expect(botTurns({ def, session: ended, view: ended.state, botSeats: [0] })).toEqual([]);
  });
});

describe('a host handover cannot change a bot’s mind', () => {
  it('decides the same move from the same position, on any host', () => {
    const session = blitz();
    const first = botTurns({ def, session, view: session.state, botSeats: [0] });
    const second = botTurns({ def, session, view: session.state, botSeats: [0] });
    expect(second).toEqual(first);
  });

  it('decides afresh once the log moves on', () => {
    const session = blitz();
    const before = botTurns({ def, session, view: session.state, botSeats: [0] })[0]!;
    const next = sessionApply(def, session, 0, 'draw.stock').session;
    const after = botTurns({ def, session: next, view: next.state, botSeats: [0] })[0]!;
    expect(botTurnKey(next as never, 0)).not.toBe(botTurnKey(session as never, 0));
    expect(after.move.id).toBe('discard');
    expect(before.move.id).not.toBe('discard');
  });

  it('keys a turn by log position and seat, so one turn schedules once', () => {
    const session = blitz();
    expect(botTurnKey(session as never, 0)).toBe(botTurnKey(session as never, 0));
    expect(botTurnKey(session as never, 0)).not.toBe(botTurnKey(session as never, 1));
  });
});

/**
 * A race: three seats may all act at once, and only one of them can slap. This
 * is the shape Rat Screw's slap window has, built here directly so the test is
 * about the driver rather than about any one game pack.
 */
const raceConfig = defineConfig<RuleValues>([], []);
const race: GameDef<{ seats: number; slapped: number | null }, RuleValues> = {
  id: 'race',
  configSchema: raceConfig,
  howToPlay: { summary: 'race', objective: 'race', sections: [] },
  setup: (ctx) => ({ seats: ctx.seats, slapped: null }),
  moves: {
    slap: {
      validate: () => true,
      apply: (state, seat) => ({ ...state, slapped: state.slapped ?? seat }),
    },
  },
  flow: {
    start: (state) => ({
      phase: 'slap',
      actor: null,
      actors: Array.from({ length: state.seats }, (_, seat) => seat),
      round: 1,
    }),
    legalMoves: () => [{ id: 'slap' }],
    legalMovesFor: (state, _phase, _seat) => (state.slapped === null ? [{ id: 'slap' }] : []),
    advance: (state) => ({
      phase: {
        phase: 'slap',
        actor: null,
        actors: Array.from({ length: state.seats }, (_, seat) => seat),
        round: 1,
      },
    }),
  },
  playerView: (state) => state,
  end: () => null,
  bots: [
    {
      id: 'racer',
      label: 'Racer',
      tier: 1,
      chooseMove: (_view, _seat, legal) => legal[0] ?? null,
    },
  ],
};

describe('simultaneous phases', () => {
  it('lets every acting bot seat answer at once', () => {
    const session = createSession(race, { seed: 5, config: raceConfig.defaults(), seats: 3 });
    const turns = botTurns({ def: race, session, view: session.state, botSeats: [0, 1, 2] });
    expect(turns.map((turn) => turn.seat)).toEqual([0, 1, 2]);
    expect(turns.every((turn) => turn.move.id === 'slap')).toBe(true);
  });

  it('drives only the seats a bot actually holds', () => {
    const session = createSession(race, { seed: 5, config: raceConfig.defaults(), seats: 3 });
    const turns = botTurns({ def: race, session, view: session.state, botSeats: [2] });
    expect(turns.map((turn) => turn.seat)).toEqual([2]);
  });

  it('stops offering a move once the race is settled', () => {
    const session = createSession(race, { seed: 5, config: raceConfig.defaults(), seats: 3 });
    const settled = sessionApply(race, session, 1, 'slap').session;
    expect(
      botTurns({ def: race, session: settled, view: settled.state, botSeats: [0, 2] }),
    ).toEqual([]);
  });
});

describe('a bot plays a veiled hand from the resolved view, not the shared one', () => {
  it('finds no move while the hand is still handles, and one once it is readable', () => {
    const veiled = createSession(def, {
      seed: 808,
      config: CONFIG,
      seats: 3,
      veiled: true,
      deckOrder: [
        ...Array.from({ length: 9 }, (_, index) => `v#${index}`),
        'S2',
        ...Array.from({ length: 42 }, (_, index) => `v#${index + 10}`),
      ],
    });

    // The shared board holds handles, so the driver declines to play that seat
    // at all rather than handing Blitz's policy a card id it cannot value.
    expect(botTurns({ def, session: veiled, view: veiled.state, botSeats: [0] })).toEqual([]);

    // With the seat's cards resolved — which is what a host holding the rebuilt
    // layer sees — the bot reasons over real cards.
    const drawn = sessionApply(def, veiled, 0, 'draw.discard').session;
    const resolved = {
      ...drawn.state,
      hands: drawn.state.hands.map((hand, seat) =>
        seat === 0
          ? hand.map((card, index) => (card.startsWith('v#') ? `H${index + 3}` : card))
          : hand,
      ),
    } as BlitzState;
    const turns = botTurns({ def, session: drawn, view: resolved, botSeats: [0] });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.move.id).toBe('discard');
    expect((turns[0]!.move.payload as { card: string }).card).not.toMatch(/^v#/);
  });
});

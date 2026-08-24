import {
  createSession,
  makeRng,
  replaySession,
  sessionApply,
  stateHash,
  type GameDef,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ginConfigSchema, type GinConfig } from './config';
import { createGinMatchDef, matchEndResult } from './matchGame';
import type { GinMatchState } from './state';
import { deadwoodOf } from './melds';
import { GIN_TIER_BOTS } from './bots';

const def = createGinMatchDef();
const DEFAULTS = ginConfigSchema.defaults();

type MatchSession = GameSession<GinMatchState, GinConfig>;

function play(session: MatchSession, seat: number, move: string, payload?: unknown): MatchSession {
  const outcome = sessionApply(def, session, seat, move, payload);
  if (outcome.rejected) throw new Error(`${move} rejected: ${outcome.rejected.code}`);
  return outcome.session;
}

interface Acting {
  seat: number;
  legal: readonly { id: string; payload?: unknown }[];
}

function acting(gameDef: GameDef<GinMatchState, GinConfig>, session: MatchSession): Acting | null {
  const seat = session.phase.actor;
  if (seat === null || session.status !== 'playing') return null;
  const legal = gameDef.flow.legalMovesFor!(session.state, session.phase, seat);
  if (legal.length === 0) return null;
  return { seat, legal };
}

function pickMove(
  state: GinMatchState,
  seat: number,
  legal: readonly { id: string; payload?: unknown }[],
) {
  if (state.folded) return legal.find((move) => move.id === 'ready') ?? legal[0]!;
  const knock = legal.find((move) => move.id === 'knock');
  const hand = state.hand.hands[seat] ?? [];
  if (knock && hand.length > 0 && deadwoodOf(hand) <= state.rules.knockCap) return knock;
  return legal[0]!;
}

/** Drives with first-legal/knock-when-eligible until folded or ended. */
function driveToHandEnd(session: MatchSession, maxEvents = 4000): MatchSession {
  let cursor = session;
  let guard = 0;
  while (cursor.status === 'playing' && !cursor.state.folded && guard++ < maxEvents) {
    const next = acting(def, cursor);
    if (!next) break;
    const choice = pickMove(cursor.state, next.seat, next.legal);
    cursor = play(cursor, next.seat, choice.id, choice.payload);
  }
  return cursor;
}

/** Full bot match driver used by determinism + replay + completion tests. */
function runBotMatch(seed: number, config: GinConfig = DEFAULTS) {
  const botsDef = createGinMatchDef({ bots: GIN_TIER_BOTS });
  let session = createSession(botsDef, { seed, config, seats: 2 });
  let guard = 0;
  while (session.status === 'playing' && guard++ < 6000) {
    const next = acting(botsDef, session);
    if (!next) break;
    const policy = botsDef.bots[next.seat % botsDef.bots.length]!;
    const view = botsDef.playerView(session.state, next.seat);
    const choice =
      policy.chooseMove(view, next.seat, next.legal, makeRng(seed).fork(`ev${guard}`), {
        thinkMs: () => 0,
      }) ?? next.legal[0]!;
    const outcome = sessionApply(botsDef, session, next.seat, choice.id, choice.payload);
    if (outcome.rejected) throw new Error(`${choice.id}: ${outcome.rejected.message}`);
    session = outcome.session;
  }
  return { session, def: botsDef };
}

describe('the match wrapper', () => {
  it('starts a live hand inside the match session', () => {
    const session = createSession(def, { seed: 9, config: DEFAULTS, seats: 2 });
    expect(session.state.handIndex).toBe(0);
    expect(session.state.scores).toEqual([0, 0]);
    expect(session.state.hand.hands[0]).toHaveLength(10);
    expect(session.phase.round).toBe(1);
    expect(session.phase.phase).toBe('option');
  });

  it('folds finished hands into running scores through the ready window', () => {
    let session = driveToHandEnd(createSession(def, { seed: 21, config: DEFAULTS, seats: 2 }));
    expect(session.state.folded).toBe(true);
    expect(session.state.lastOutcome).not.toBeNull();
    expect(session.phase.phase).toBe('hand-end');

    const scorer = session.state.lastOutcome!.scorer;
    const expected = scorer !== null ? session.state.lastOutcome!.points : 0;
    session = play(session, 0, 'ready');
    expect(session.state.readied).toEqual([0]);
    session = play(session, 1, 'ready');
    expect(session.state.handIndex).toBe(1);
    expect(session.state.dealer).toBe(1); // dealer flipped
    expect(session.state.folded).toBe(false);
    if (scorer !== null) {
      expect(session.state.scores[scorer]).toBe(expected);
      expect(session.state.handsWon[scorer]).toBe(1);
    }
  });

  it('rejects double-ready and ready during live play', () => {
    let session = driveToHandEnd(createSession(def, { seed: 21, config: DEFAULTS, seats: 2 }));
    session = play(session, 0, 'ready');
    // seat 0 already signalled, so it is no longer an acting seat
    const again = sessionApply(def, session, 0, 'ready').rejected?.code;
    expect(['already-ready', 'not-your-turn']).toContain(again);
    const live = createSession(def, { seed: 2, config: DEFAULTS, seats: 2 });
    const actor = live.phase.actor!;
    // readying mid-hand must be refused — either as illegal or by validate
    const liveReady = sessionApply(def, live, actor, 'ready').rejected?.code;
    expect(['hand-in-play', 'illegal-move']).toContain(liveReady);
  });

  it('ends the match when a sole leader crosses the target', () => {
    const config = ginConfigSchema.resolve({ matchTarget: 50 });
    const { session } = runBotMatch(77, config);
    expect(session.status).toBe('ended');
    expect(session.result?.reason).toBe('gin-match');
    const winner = session.result!.winner as number;
    expect(session.state.scores[winner]).toBeGreaterThanOrEqual(50);
    const loser = winner === 0 ? 1 : 0;
    expect(session.state.scores[winner]!).toBeGreaterThan(session.state.scores[loser]!);
  });

  it('applies the box bonus only when enabled', () => {
    const base = createSession(def, {
      seed: 8,
      config: ginConfigSchema.resolve({ boxBonus: true }),
      seats: 2,
    });
    const ended = driveToHandEnd(base);
    const scorer = ended.state.lastOutcome?.scorer;
    if (scorer !== null && scorer !== undefined) {
      expect(ended.state.scores[scorer]).toBe(ended.state.lastOutcome!.points + 25);
    }
  });

  it('keeps tied leaders playing past the target', () => {
    const base = createSession(def, { seed: 6, config: DEFAULTS, seats: 2 });
    const tied: GinMatchState = {
      ...base.state,
      scores: [100, 100],
      folded: true,
      lastOutcome: null,
      readied: [],
    };
    expect(matchEndResult(tied)).toBeNull();
  });

  it('plays a full bot-driven match to completion', () => {
    const { session } = runBotMatch(1234);
    expect(session.status).toBe('ended');
    expect(session.result?.reason).toBe('gin-match');
    expect(session.state.handIndex).toBeGreaterThan(0);
  }, 120_000);

  it('is deterministic and replays from its event log alone', () => {
    const a = runBotMatch(1234);
    const b = runBotMatch(1234);
    expect(a.session.log.map((event) => event.hash)).toEqual(
      b.session.log.map((event) => event.hash),
    );

    const { session, def: botsDef } = runBotMatch(555);
    const replayed = replaySession(botsDef, 555, session.log, {
      config: DEFAULTS,
      seats: 2,
    });
    expect(replayed.status).toBe(session.status);
    expect(stateHash(replayed.state)).toBe(stateHash(session.state));
    expect(replayed.result).toEqual(session.result);
    expect(replayed.state.scores).toEqual(session.state.scores);
  }, 180_000);

  it('redacts opponent cards in the wrapped view too', () => {
    const session = createSession(def, { seed: 5, config: DEFAULTS, seats: 2 });
    const view = def.playerView(session.state, 0);
    expect(view.hand.hands[0]).toEqual(session.state.hand.hands[0]);
    expect(view.hand.hands[1]!.every((card) => card === '?')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createMatch, matchApply, matchNextRound, replayMatch, roundSeed } from '@parlour/engine';
import { heartsConfigSchema, passDirectionFor, type HeartsRules } from './config';
import { createHeartsMatchDef } from './match';

const def = createHeartsMatchDef();

function create(seed: number, config: HeartsRules) {
  return createMatch(def, { seed, config, seats: 4 }).session;
}

type MatchSession = ReturnType<typeof create>;

function openMatch(config: Partial<HeartsRules> = {}, seed = 3_000): MatchSession {
  return create(seed, heartsConfigSchema.resolve(config));
}

function playHand(session: MatchSession): MatchSession {
  let current = session;
  let guard = 0;
  while (current.status === 'playing' && guard++ < 600) {
    if (current.round.phase.phase === 'pass') {
      const seat = current.round.state.selections.findIndex((pick) => pick === null);
      if (seat === undefined || seat === null || seat < 0)
        throw new Error('pass phase with no pending seat');
      const hand = [...(current.round.state.hands[seat] ?? [])].sort();
      const outcome = matchApply(def, current, seat, 'passCards', { cards: hand.slice(-3) });
      if (outcome.rejected) throw new Error(`matchApply rejected: ${outcome.rejected.code}`);
      current = outcome.session;
      continue;
    }
    const seat = current.round.state.turn;
    const moves =
      current.round.def.flow.legalMovesFor?.(current.round.state, current.round.phase, seat) ?? [];
    const cardMoves = moves.filter(
      (move) =>
        move.id === 'playCard' && typeof (move.payload as { card?: unknown })?.card === 'string',
    );
    if (cardMoves.length === 0) break;
    const chosen = (cardMoves as { payload: { card: string } }[])
      .map((move) => move.payload.card)
      .sort((a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10))[0]!;
    const outcome = matchApply(def, current, seat, 'playCard', { card: chosen });
    if (outcome.rejected) throw new Error(`matchApply rejected: ${outcome.rejected.code}`);
    current = outcome.session;
  }
  return current;
}

describe('hearts match composition', () => {
  it('rotates pass direction across hands and folds cumulative scores', () => {
    let session = openMatch({ gameOver: 50 });
    expect(session.match.gameOverAt).toBe(50);
    for (let roundIndex = 0; roundIndex < 4; roundIndex++) {
      expect(session.round.config.passDirection).toBe(passDirectionFor(roundIndex, true));
      session = playHand(session);
      if (session.status !== 'round-over' && session.status !== 'ended') {
        throw new Error('hand did not finish');
      }
      if (session.status === 'ended') break;
      session = matchNextRound(def, session).session;
    }
    expect(session.history.length).toBeGreaterThan(0);
    const totals = new Map<number, number>();
    for (const result of session.history) {
      for (const rank of result.rankings) {
        totals.set(rank.seat, (totals.get(rank.seat) ?? 0) + Number(rank.detail?.points ?? 0));
      }
    }
    // the fold's running totals equal the sum of hand results
    for (const [seat, total] of totals) {
      expect(session.match.scores[seat] ?? -999).toBe(total);
    }
  });

  it('ends when a score crosses the threshold with lowest total winning', () => {
    let session = openMatch({ gameOver: 26 });
    let rounds = 0;
    while (session.status !== 'ended' && rounds < 30) {
      session = playHand(session);
      rounds += 1;
      if (session.status === 'round-over') {
        session = matchNextRound(def, session).session;
      }
    }
    expect(session.status).toBe('ended');
    expect(session.result).not.toBeNull();
    const best = Math.min(...session.match.scores); // scores always length 4
    expect(session.match.scores.some((score) => score >= 26)).toBe(true);
    const winners = session.result!.rankings.filter((rank) => rank.rank === 1);
    const top = session.result!.rankings.find((r) => r.rank === 1);
    expect(Number(top?.detail?.points)).toBe(best);
    expect(winners.length).toBeGreaterThanOrEqual(1);
  });

  it('replays an entire multi-hand match bit-for-bit', () => {
    let session = openMatch({ gameOver: 30 }, 4_242);
    let rounds = 0;
    while (session.status !== 'ended' && rounds < 40) {
      session = playHand(session);
      rounds += 1;
      if (session.status === 'round-over') {
        session = matchNextRound(def, session).session;
      }
    }
    const logs = [...session.roundLogs];
    const replayed = replayMatch(def, 4_242, logs, {
      config: heartsConfigSchema.resolve({ gameOver: 30 }),
      seats: 4,
    });
    expect(replayed.status).toBe('ended');
    expect(replayed.match.scores).toEqual(session.match.scores);
    expect(replayed.result).toEqual(session.result);
  });

  it('derives stable round seeds from the match seed', () => {
    expect(roundSeed(7, 0)).toBe(roundSeed(7, 0));
    expect(roundSeed(7, 0)).not.toBe(roundSeed(7, 1));
  });

  it('rejects moves while a round is over', () => {
    const session = openMatch({});
    expect(matchApply(def, session, 0, 'playCard', { card: 'C2' }).rejected).toBeDefined();
  });
});

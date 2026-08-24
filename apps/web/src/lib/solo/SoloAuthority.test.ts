import { applyPreset, createSession, type GameSession } from '@parlour/engine';
import { cribbageConfigSchema } from '@parlour/game-cribbage';
import { createEuchreDef, tierBot, type EuchreRules, type EuchreState } from '@parlour/game-euchre';
import { ratscrewGame } from '@parlour/game-ratscrew';
import { describe, expect, it } from 'vitest';
import { createAuthorityClock } from './authorityClock';
import { CribbageTransport } from './CribbageTransport';
import { HeartsTransport } from './HeartsTransport';
import { LocalTransport } from './LocalTransport';
import {
  adaptSessionApply,
  adaptSessionInject,
  SoloAuthority,
  type SoloDispatch,
} from './SoloAuthority';

function transcript<TSnapshot>(outcome: SoloDispatch<TSnapshot>) {
  return {
    events: outcome.events.map((event) => ({
      seq: event.seq,
      seat: event.seat,
      move: event.move,
    })),
    fx: outcome.fx.map((event) => event.kind),
    rejected: outcome.rejected,
    snapshot: outcome.snapshot,
  };
}

function expectAccepted<TSnapshot>(outcome: SoloDispatch<TSnapshot>) {
  const seen = transcript(outcome);
  expect(seen.rejected).toBeNull();
  expect(seen.events.length).toBeGreaterThan(0);
  expect(Array.isArray(seen.fx)).toBe(true);
  expect(seen.snapshot).toEqual(outcome.snapshot);
  return seen;
}

function playHeartsToRoundOver(seed = 31) {
  const hearts = new HeartsTransport({
    mode: 'classic',
    seed,
    player: { name: 'You', avatarId: 'ember' },
  });
  let guard = 0;
  while (hearts.getSnapshot().status === 'playing') {
    if (guard++ >= 20_000) throw new Error('hearts hand did not finish within 20k actions');
    if (!hearts.humanPending()) {
      hearts.playBotsUntilHuman();
      continue;
    }
    const snapshot = hearts.getSnapshot();
    if (snapshot.hand.state.passing && snapshot.hand.state.selections[0] === null) {
      const hand = [...(snapshot.hand.state.hands[0] ?? [])].sort();
      const passed = hearts.dispatch('passCards', { cards: [hand[0]!, hand[1]!, hand[2]!] });
      if (passed.rejected) throw new Error(passed.rejected.message);
      continue;
    }
    const card = hearts
      .legalMovesForSeat(0)
      .filter((move) => move.id === 'playCard')
      .map((move) => (move.payload as { card: string }).card)
      .sort(
        (left, right) => Number.parseInt(left.slice(1), 10) - Number.parseInt(right.slice(1), 10),
      )[0];
    if (!card) {
      hearts.playBotsUntilHuman();
      if (hearts.getSnapshot().status === 'playing' && hearts.getSnapshot().hand.state.handOver) {
        break;
      }
      continue;
    }
    const played = hearts.dispatch('playCard', { card });
    if (played.rejected) throw new Error(played.rejected.message);
  }
  return hearts;
}

function expectRejected<TSnapshot>(
  outcome: SoloDispatch<TSnapshot>,
  code: string,
  message: string,
) {
  const seen = transcript(outcome);
  expect(seen).toEqual({
    events: [],
    fx: [],
    rejected: { code, message },
    snapshot: outcome.snapshot,
  });
  return seen;
}

describe('SoloAuthority contract', () => {
  describe('turn-based session (euchre)', () => {
    function make() {
      const def = createEuchreDef();
      const policy = tierBot(2);
      const session = createSession(def, {
        seed: 31,
        config: applyPreset(def.configSchema, 'classic'),
        seats: 4,
      });
      const authority = new SoloAuthority<
        GameSession<EuchreState, EuchreRules>,
        { session: GameSession<EuchreState, EuchreRules> },
        EuchreState
      >(
        {
          snapshot: (live) => ({ session: live }),
          apply: adaptSessionApply(def),
          isPlaying: (live) => live.status === 'playing',
          bots: {
            seed: 31,
            actor: (live) => live.phase.actor,
            legalMoves: (live) => def.flow.legalMoves(live.state, live.phase),
            playerView: (live, seat) => def.playerView(live.state, seat),
            policy: () => policy,
            rngFork: (live) => `hand:${live.state.handNo}:event:${live.log.length}`,
          },
        },
        session,
      );
      return { def, authority };
    }

    it('records a human-success / human-reject / bot-step / multi-bot transcript', () => {
      const { def, authority } = make();
      const published: SoloDispatch<{ session: GameSession<EuchreState, EuchreRules> }>[] = [];
      authority.subscribe((outcome) => published.push(outcome));

      if (authority.getLive().phase.actor !== 0) {
        const drained = authority.playBotsUntilHuman();
        expect(drained.length).toBeGreaterThan(0);
        for (const step of drained) expectAccepted(step);
        expect(published).toHaveLength(drained.length);
      }

      const before = authority.getLive().log.length;
      const illegal = authority.dispatch('not-a-real-move');
      expectRejected(illegal, 'illegal-move', 'move not-a-real-move is not legal right now');
      expect(authority.getLive().log).toHaveLength(before);
      expect(published).not.toContainEqual(illegal);

      const legal = def.flow.legalMoves(authority.getLive().state, authority.getLive().phase);
      expect(legal.length).toBeGreaterThan(0);
      const played = authority.dispatch(legal[0]!.id, legal[0]!.payload);
      const success = expectAccepted(played);
      expect(success.events.some((event) => event.seat === 0)).toBe(true);
      expect(published.at(-1)).toEqual(played);

      if (authority.getLive().status === 'playing' && authority.getLive().phase.actor !== 0) {
        const bot = authority.playBotTurn();
        const botSeen = expectAccepted(bot);
        expect(botSeen.events.some((event) => event.seat !== 0)).toBe(true);
      }

      if (authority.getLive().status === 'playing' && authority.getLive().phase.actor !== 0) {
        const loop = authority.playBotsUntilHuman();
        expect(loop.length).toBeGreaterThan(0);
        for (const step of loop) expectAccepted(step);
        expect(
          authority.getLive().phase.actor === 0 || authority.getLive().status !== 'playing',
        ).toBe(true);
      }

      if (authority.getLive().status === 'playing' && authority.getLive().phase.actor === 0) {
        expectRejected(authority.playBotTurn(), 'not-bot-turn', 'no bot is currently acting');
      }
    });

    it('drains a multi-bot Blitz loop with the same transcript shape', () => {
      const blitz = new LocalTransport({
        mode: 'classic',
        seats: 3,
        botTier: 2,
        seed: 31,
        player: { name: 'You', avatarId: 'fox' },
      });
      expect(blitz.getSnapshot().session.phase.actor).toBe(0);
      const drawn = blitz.dispatch('draw.stock');
      expectAccepted(drawn);
      const discard = blitz.legalMoves().find((move) => move.id === 'discard');
      expect(discard).toBeDefined();
      expectAccepted(blitz.dispatch('discard', discard?.payload));
      const loop = blitz.playBotsUntilHuman();
      expect(loop.length).toBeGreaterThan(0);
      for (const step of loop) expectAccepted(step);
      expect(blitz.getSnapshot().session.phase.actor).toBe(0);
    });
  });

  describe('Hearts / Cribbage untilHuman variance', () => {
    it('holds Hearts bots while the human still owes a pass, then drains the rest', () => {
      const hearts = new HeartsTransport({
        mode: 'classic',
        seed: 31,
        player: { name: 'You', avatarId: 'ember' },
      });
      expect(hearts.humanPending()).toBe(true);
      expect(hearts.playBotsUntilHuman()).toEqual([]);
      expectRejected(hearts.startNextHand(), 'hand-playing', 'the current hand is not over');

      const hand = [...(hearts.getSnapshot().hand.state.hands[0] ?? [])].sort();
      const passed = hearts.dispatch('passCards', { cards: [hand[0]!, hand[1]!, hand[2]!] });
      const passSeen = expectAccepted(passed);
      expect(passSeen.events.some((event) => event.move === 'passCards')).toBe(true);

      if (!hearts.humanPending() && hearts.getSnapshot().status === 'playing') {
        const drained = hearts.playBotsUntilHuman();
        expect(drained.length).toBeGreaterThan(0);
        for (const step of drained) expectAccepted(step);
        expect(hearts.humanPending()).toBe(true);
      }
    });

    it('returns an empty events list from startNextHand, matching the old public outcome', () => {
      const hearts = playHeartsToRoundOver();
      expect(hearts.getSnapshot().status).toBe('round-over');
      const next = hearts.startNextHand();
      expect(next.rejected).toBeNull();
      expect(next.events).toEqual([]);
      expect(next.snapshot.status).toBe('playing');
      expect(next.snapshot.round).toBe(2);
    });

    it('exits the Hearts bot loop cleanly once the hand is over', () => {
      const hearts = playHeartsToRoundOver();
      expect(hearts.getSnapshot().status).toBe('round-over');
      expect(hearts.playBotsUntilHuman()).toEqual([]);
      expect(hearts.getSnapshot().status).toBe('round-over');
    });

    it('lets Cribbage schedule the house from legalMoves, not phase.actor alone', () => {
      const cribbage = new CribbageTransport({
        mode: 'classic-pub',
        botTier: 2,
        seed: 31,
        player: { name: 'You', avatarId: 'cobalt' },
        rules: cribbageConfigSchema.resolve({ gamesToWin: 1 }),
      });
      expect(cribbage.humanCanAct()).toBe(true);
      const throwMove = cribbage.legalMoves(0)[0]!;
      const thrown = cribbage.dispatch(throwMove.id, throwMove.payload);
      expectAccepted(thrown);
      expect(cribbage.humanCanAct()).toBe(false);
      expect(cribbage.botCanAct()).toBe(true);

      const bot = cribbage.playBotTurn();
      const botSeen = expectAccepted(bot);
      expect(botSeen.events.some((event) => event.seat === 1)).toBe(true);
      expect(cribbage.legalMoves(0).map((move) => move.id)).toEqual(['cut']);
      expect(cribbage.botCanAct()).toBe(false);

      type Live = { status: 'playing' | 'ended' };
      const stopped = new SoloAuthority<Live, Live, Live>(
        {
          snapshot: (live) => live,
          apply: (live) => ({ live, events: [], fx: [] }),
          isPlaying: (live) => live.status === 'playing',
          bots: {
            seed: 1,
            actor: () => null,
            legalMoves: () => [],
            playerView: (live) => live,
            policy: () => ({
              id: 'house',
              label: 'house',
              tier: 2,
              chooseMove: () => null,
            }),
            rngFork: () => 'x',
            notBotTurn: { code: 'not-bot-turn', message: 'the house has no decision to make' },
            stopped: { code: 'match-ended', message: 'the match has ended' },
          },
        },
        { status: 'ended' },
      );
      expectRejected(stopped.playBotTurn(), 'match-ended', 'the match has ended');
    });
  });

  describe('real-time opt-out (ratscrew)', () => {
    it('reuses apply/subscribe/fx and swallows a stale reflex without inventing bots', () => {
      const nowMs = 1_000_000;
      const clock = createAuthorityClock({ now: () => nowMs, step: 'tick' });
      const session = createSession(ratscrewGame, {
        seed: 77,
        config: ratscrewGame.configSchema.resolve({ slapWindowMs: 400 }),
        seats: 2,
      });
      const authority = new SoloAuthority(
        {
          snapshot: (live) => ({
            log: live.log.length,
            turn: live.state.turn,
            window: live.state.window,
          }),
          apply: adaptSessionApply(ratscrewGame, () => ({ atMs: clock.stamp() })),
          inject: adaptSessionInject(ratscrewGame, () => ({ atMs: clock.stamp() })),
          isPlaying: (live) => live.status === 'playing',
          bufferRecentFx: true,
        },
        session,
      );

      expect(() => authority.playBotTurn()).toThrow('this authority does not schedule bot turns');
      expect(() => authority.playBotsUntilHuman()).toThrow(
        'this authority does not schedule bot turns',
      );

      const heard: unknown[] = [];
      authority.subscribe((outcome) => heard.push(transcript(outcome)));

      const before = authority.getSnapshot();
      expect(authority.tryApplyMove(1, 'flip')).toBeNull();
      expect(authority.getSnapshot()).toEqual(before);
      expect(authority.drainRecentFx()).toEqual([]);
      expect(heard).toEqual([]);

      const flipped = authority.dispatch('flip');
      expectAccepted(flipped);
      expect(heard).toHaveLength(1);
      expect(authority.drainRecentFx().map((event) => event.kind)).toEqual(
        flipped.fx.map((event) => event.kind),
      );
    });

    it('does not buffer recent fx unless the spec opts in', () => {
      const nowMs = 1_000_000;
      const clock = createAuthorityClock({ now: () => nowMs, step: 'tick' });
      const session = createSession(ratscrewGame, {
        seed: 77,
        config: ratscrewGame.configSchema.resolve({ slapWindowMs: 400 }),
        seats: 2,
      });
      const authority = new SoloAuthority(
        {
          snapshot: (live) => ({ log: live.log.length }),
          apply: adaptSessionApply(ratscrewGame, () => ({ atMs: clock.stamp() })),
          isPlaying: (live) => live.status === 'playing',
        },
        session,
      );

      const flipped = authority.dispatch('flip');
      expectAccepted(flipped);
      expect(flipped.fx.length).toBeGreaterThan(0);
      expect(authority.drainRecentFx()).toEqual([]);
    });
  });
});

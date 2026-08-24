import {
  chooseBotMove,
  createMatch,
  makeRng,
  matchApply,
  matchNextRound,
  type AppliedEvent,
  type FxEvent,
  type LegalMove,
  type MatchOutcome,
  type MatchSession,
  type RuleError,
} from '@parlour/engine';
import {
  createCribbageMatchDef,
  tierBot,
  type CribbageConfig,
  type CribbageMatchState,
  type CribbageState,
} from '@parlour/game-cribbage';
import type { CribbageModeId } from '@/lib/cribbage/modes';
import type { CribbageBotTier } from '@/stores/cribbageSetup';

const BOT_FOR_TIER = {
  1: { name: 'Doc Skunk', avatarId: 'rust', personaId: 'doc-skunk' },
  2: { name: 'Pubkeeper Otto', avatarId: 'ember', personaId: 'pubkeeper-otto' },
  3: { name: 'Countess Vera', avatarId: 'juniper', personaId: 'countess-vera' },
} as const;

export interface CribbagePlayer {
  seat: number;
  name: string;
  avatarId: string;
  personaId: string;
  isBot: boolean;
}

export interface CribbageTransportOptions {
  mode: CribbageModeId;
  botTier: CribbageBotTier;
  seed: number;
  player: { name: string; avatarId: string };
  rules: CribbageConfig;
}

export type CribbageMatchSession = MatchSession<CribbageState, CribbageConfig, CribbageMatchState>;

export interface CribbageSnapshot {
  mode: CribbageModeId;
  players: readonly CribbagePlayer[];
  match: CribbageMatchSession;
}

export interface CribbageDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: CribbageSnapshot;
}

/** In-process deterministic match authority for solo Cribbage. */
export class CribbageTransport {
  private readonly def = createCribbageMatchDef();
  private match: CribbageMatchSession;

  constructor(private readonly options: CribbageTransportOptions) {
    this.match = createMatch(this.def, {
      seed: options.seed | 0,
      config: options.rules,
      seats: 2,
    }).session;
  }

  getSnapshot(): CribbageSnapshot {
    return { mode: this.options.mode, players: this.players(), match: this.match };
  }

  legalMoves(seat = 0): readonly LegalMove[] {
    if (this.match.status !== 'playing') return [];
    const { round } = this.match;
    return (
      round.def.flow.legalMovesFor?.(round.state, round.phase, seat) ??
      (round.phase.actor === seat ? round.def.flow.legalMoves(round.state, round.phase) : [])
    );
  }

  humanCanAct(): boolean {
    return this.legalMoves(0).length > 0;
  }

  botCanAct(): boolean {
    return this.legalMoves(1).length > 0;
  }

  dispatch(move: string, payload?: unknown): CribbageDispatch {
    if (this.match.status !== 'playing') return this.reject('match-ended', 'the match has ended');
    const outcome = matchApply(this.def, this.match, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    return this.accept(outcome);
  }

  playBotTurn(): CribbageDispatch {
    if (this.match.status !== 'playing') return this.reject('match-ended', 'the match has ended');
    const legal = this.legalMoves(1);
    if (legal.length === 0) return this.reject('not-bot-turn', 'the house has no decision to make');
    const policy = tierBot(this.options.botTier);
    const rng = makeRng(this.options.seed).fork(
      `round:${this.match.roundIndex}:event:${this.match.round.log.length}:seat:1`,
    );
    const choice =
      chooseBotMove(policy, this.def.game.playerView(this.match.round.state, 1), 1, legal, rng) ??
      legal[0]!;
    const outcome = matchApply(this.def, this.match, 1, choice.id, choice.payload);
    if (outcome.rejected) {
      throw new Error(`${policy.id} chose ${choice.id}: ${outcome.rejected.message}`);
    }
    return this.accept(outcome);
  }

  private accept(
    outcome: MatchOutcome<CribbageState, CribbageConfig, CribbageMatchState>,
  ): CribbageDispatch {
    let events = [...outcome.events];
    let fx = [...outcome.fx];
    this.match = outcome.session;
    if (this.match.status === 'round-over') {
      const next = matchNextRound(this.def, this.match);
      if (next.rejected) throw new Error(next.rejected.message);
      this.match = next.session;
      events = [...events, ...next.events];
      fx = [...fx, ...next.fx];
    }
    return { events, fx, rejected: null, snapshot: this.getSnapshot() };
  }

  private players(): CribbagePlayer[] {
    const bot = BOT_FOR_TIER[this.options.botTier];
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        personaId: 'local-player',
        isBot: false,
      },
      { seat: 1, ...bot, isBot: true },
    ];
  }

  private reject(code: string, message: string): CribbageDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }
}

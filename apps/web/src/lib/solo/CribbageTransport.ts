import { createMatch, matchNextRound, type LegalMove, type MatchSession } from '@parlour/engine';
import {
  createCribbageMatchDef,
  tierBot,
  type CribbageConfig,
  type CribbageMatchState,
  type CribbageState,
} from '@parlour/game-cribbage';
import type { CribbageModeId } from '@/lib/cribbage/modes';
import type { CribbageBotTier } from '@/stores/cribbageSetup';
import { adaptMatchApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';
import { localSeat } from './seating';

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

export type CribbageDispatch = SoloDispatch<CribbageSnapshot>;

/** In-process deterministic match authority for solo Cribbage. */
export class CribbageTransport {
  private readonly def = createCribbageMatchDef();
  private readonly options: CribbageTransportOptions;
  private readonly authority: SoloAuthority<CribbageMatchSession, CribbageSnapshot, CribbageState>;

  constructor(options: CribbageTransportOptions) {
    this.options = options;
    const match = createMatch(this.def, {
      seed: options.seed | 0,
      config: options.rules,
      seats: 2,
    }).session;
    const policy = tierBot(options.botTier);
    this.authority = new SoloAuthority(
      {
        snapshot: (live): CribbageSnapshot => ({
          mode: options.mode,
          players: this.players(),
          match: live,
        }),
        apply: adaptMatchApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        afterApply: ({ live, events, fx }) => {
          if (live.status !== 'round-over') return;
          const next = matchNextRound(this.def, live);
          if (next.rejected) throw new Error(next.rejected.message);
          return {
            live: next.session,
            events: [...events, ...next.events],
            fx: [...fx, ...next.fx],
          };
        },
        bots: {
          seed: options.seed,
          actor: (live) => (this.legalMovesOn(live, 1).length > 0 ? 1 : null),
          legalMoves: (live, seat) => this.legalMovesOn(live, seat),
          playerView: (live, seat) => this.def.game.playerView(live.round.state, seat),
          policy: () => policy,
          rngFork: (live) => `round:${live.roundIndex}:event:${live.round.log.length}:seat:1`,
          hasTurn: (live) => live.status === 'playing' && this.legalMovesOn(live, 1).length > 0,
          notBotTurn: { code: 'not-bot-turn', message: 'the house has no decision to make' },
          stopped: { code: 'match-ended', message: 'the match has ended' },
        },
      },
      match,
    );
  }

  getSnapshot(): CribbageSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(seat = 0): readonly LegalMove[] {
    return this.legalMovesOn(this.authority.getLive(), seat);
  }

  humanCanAct(): boolean {
    return this.legalMoves(0).length > 0;
  }

  botCanAct(): boolean {
    return this.legalMoves(1).length > 0;
  }

  dispatch(move: string, payload?: unknown): CribbageDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): CribbageDispatch {
    return this.authority.playBotTurn();
  }

  private legalMovesOn(match: CribbageMatchSession, seat: number): readonly LegalMove[] {
    if (match.status !== 'playing') return [];
    const { round } = match;
    return (
      round.def.flow.legalMovesFor?.(round.state, round.phase, seat) ??
      (round.phase.actor === seat ? round.def.flow.legalMoves(round.state, round.phase) : [])
    );
  }

  private players(): CribbagePlayer[] {
    const bot = BOT_FOR_TIER[this.options.botTier];
    return [
      { ...localSeat(this.options.player), personaId: 'local-player' },
      { seat: 1, ...bot, isBot: true },
    ];
  }
}

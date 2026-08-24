import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createSpadesDef,
  tierBot,
  type SpadesPlayerView,
  type SpadesRules,
  type SpadesState,
} from '@parlour/game-spades';
import type { SpadesModeId } from '@/lib/spades/modes';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

/** Your partner sits across the table at seat 2; opponents flank at 1 and 3. */
const SPADES_CAST = [
  { name: 'Ruth', avatarId: 'ember' },
  { name: 'Cal', avatarId: 'plum' },
  { name: 'Iris', avatarId: 'marigold' },
] as const;

export interface SpadesSoloPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface SpadesTransportOptions {
  mode: SpadesModeId;
  seed: number;
  player: { name: string; avatarId: string };
  /** bot tier for the three house seats (default medium) */
  botTier?: 1 | 2 | 3;
}

export interface SpadesSnapshot {
  mode: SpadesModeId;
  players: readonly SpadesSoloPlayer[];
  session: GameSession<SpadesState, SpadesRules>;
  matchWinnerTeam: 0 | 1 | null;
}

export type SpadesDispatch = SoloDispatch<SpadesSnapshot>;

/**
 * In-process authority for solo Spades. The full match — every hand, the
 * running score, bags and the dealer rotation — lives inside one deterministic
 * engine session, so this facade only projects snapshots and names the house
 * seats. Open tables auto-deal the next hand, so there is no round plumbing
 * here either.
 */
export class SpadesTransport {
  private readonly def = createSpadesDef();
  private readonly options: SpadesTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<SpadesState, SpadesRules>,
    SpadesSnapshot,
    SpadesPlayerView
  >;

  constructor(options: SpadesTransportOptions) {
    this.options = options;
    const policy = tierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, options.mode),
      seats: 4,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): SpadesSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          matchWinnerTeam: matchWinnerTeamOf(live),
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live) => this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => policy,
          rngFork: (live) => `hand:${live.state.handNo}:event:${live.log.length}`,
          untilHumanGuard: 500,
        },
      },
      session,
    );
  }

  getSnapshot(): SpadesSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const seat = session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): SpadesDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): SpadesDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): SpadesDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): SpadesSoloPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...SPADES_CAST.map((cast, index) => ({
        seat: index + 1,
        name: cast.name,
        avatarId: cast.avatarId,
        isBot: true,
      })),
    ];
  }
}

function matchWinnerTeamOf(session: GameSession<SpadesState, SpadesRules>): 0 | 1 | null {
  if (session.result === null) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}

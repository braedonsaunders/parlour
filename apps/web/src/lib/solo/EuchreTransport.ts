import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import { createEuchreDef, tierBot, type EuchreRules, type EuchreState } from '@parlour/game-euchre';
import type { EuchreModeId } from '@/lib/euchre/modes';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';
import { houseSeats, winningTeamOf } from './seating';

/** House partners and opponents sit in table order around seat 0. */
const EUCHRE_CAST = [
  { name: 'Marge', avatarId: 'plum' },
  { name: 'Vinny', avatarId: 'ember' },
  { name: 'Dot', avatarId: 'marigold' },
] as const;

export interface EuchreSoloPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface EuchreTransportOptions {
  mode: EuchreModeId;
  seed: number;
  player: { name: string; avatarId: string };
  /** bot tier for the three house seats (default medium) */
  botTier?: 1 | 2 | 3;
}

export interface EuchreSnapshot {
  mode: EuchreModeId;
  players: readonly EuchreSoloPlayer[];
  session: GameSession<EuchreState, EuchreRules>;
  matchWinnerTeam: 0 | 1 | null;
}

export type EuchreDispatch = SoloDispatch<EuchreSnapshot>;

/**
 * In-process authority for solo euchre. The full match — every hand, score and
 * dealer rotation — lives inside one deterministic engine session, so this
 * facade only projects snapshots and names the house seats.
 */
export class EuchreTransport {
  private readonly def = createEuchreDef();
  private readonly options: EuchreTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<EuchreState, EuchreRules>,
    EuchreSnapshot,
    EuchreState
  >;

  constructor(options: EuchreTransportOptions) {
    this.options = options;
    const policy = tierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, presetForMode(options.mode)),
      seats: 4,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): EuchreSnapshot => ({
          mode: options.mode,
          players: houseSeats(options.player, EUCHRE_CAST),
          session: live,
          matchWinnerTeam: winningTeamOf(live),
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

  getSnapshot(): EuchreSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const seat = session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): EuchreDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): EuchreDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): EuchreDispatch[] {
    return this.authority.playBotsUntilHuman();
  }
}

const MODE_PRESETS: Record<EuchreModeId, string> = {
  classic: 'classic',
  'quick-cut': 'quick-cut',
  'long-game': 'long-game',
  'old-school': 'old-school',
};

function presetForMode(mode: EuchreModeId): string {
  return MODE_PRESETS[mode];
}

import {
  applyPreset,
  chooseBotMove,
  createSession,
  makeRng,
  sessionApply,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type RuleError,
} from '@parlour/engine';
import {
  createEuchreDef,
  euchreConfig,
  tierBot,
  type EuchreRules,
  type EuchreState,
} from '@parlour/game-euchre';
import type { EuchreModeId } from '@/lib/euchre/modes';

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

export interface EuchreDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: EuchreSnapshot;
}

/**
 * In-process authority for solo euchre. The full match — every hand, score and
 * dealer rotation — lives inside one deterministic engine session, so this
 * transport only routes moves and bot turns. Mirrors WildTransport's contract
 * so the euchre table page rhymes with the others.
 */
export class EuchreTransport {
  private readonly def = createEuchreDef();
  private readonly options: EuchreTransportOptions;
  private readonly policy;
  private session: GameSession<EuchreState, EuchreRules>;

  constructor(options: EuchreTransportOptions) {
    this.options = options;
    this.policy = tierBot(options.botTier ?? 2);
    this.session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, presetForMode(options.mode)),
      seats: 4,
    });
  }

  getSnapshot(): EuchreSnapshot {
    return {
      mode: this.options.mode,
      players: this.players(),
      session: this.session,
      matchWinnerTeam: matchWinnerTeamOf(this.session),
    };
  }

  legalMoves(): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    const seat = this.session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(this.session.state, this.session.phase);
  }

  /** Human seat 0 acts; the engine validates turn/legality. */
  dispatch(move: string, payload?: unknown): EuchreDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('match-ended', 'the match has ended');
    }
    const outcome = sessionApply(this.def, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return { events: outcome.events, fx: outcome.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  playBotTurn(): EuchreDispatch {
    const seat = this.session.phase.actor;
    if (this.session.status !== 'playing' || seat === null || seat === 0) {
      return this.reject('not-bot-turn', 'no bot is currently acting');
    }
    const legal = this.def.flow.legalMoves(this.session.state, this.session.phase);
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(this.options.seed).fork(`hand:${this.session.state.handNo}:event:${this.session.log.length}`);
    const view = this.def.playerView(this.session.state, seat);
    const choice = chooseBotMove(this.policy, view, seat, legal, rng) ?? legal[0]!;
    const applied = sessionApply(this.def, this.session, seat, choice.id, choice.payload);
    if (applied.rejected) {
      throw new Error(`${this.policy.id} chose ${choice.id}: ${applied.rejected.message}`);
    }
    this.session = applied.session;
    return {
      events: applied.events,
      fx: applied.fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    };
  }

  playBotsUntilHuman(): EuchreDispatch[] {
    const outcomes: EuchreDispatch[] = [];
    let guard = 0;
    while (
      this.session.status === 'playing' &&
      this.session.phase.actor !== null &&
      this.session.phase.actor !== 0
    ) {
      if (guard++ >= 500) throw new Error('bot loop did not return control after 500 actions');
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  private players(): EuchreSoloPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...EUCHRE_CAST.map((cast, index) => ({
        seat: index + 1,
        name: cast.name,
        avatarId: cast.avatarId,
        isBot: true,
      })),
    ];
  }

  private reject(code: string, message: string): EuchreDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
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

function matchWinnerTeamOf(session: GameSession<EuchreState, EuchreRules>): 0 | 1 | null {
  if (session.result === null) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}

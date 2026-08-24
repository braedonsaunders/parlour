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
  presidentGame,
  presidentBots,
  MIN_SEATS,
  MAX_SEATS,
  type PresidentRules,
  type PresidentState,
} from '@parlour/game-president';
import type { PresidentModeId } from '@/lib/president/modes';
import type { BotTier } from '@/stores/setup';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const PRESIDENT_BOTS = [
  { name: 'Marigold', avatarId: 'marigold' },
  { name: 'Slate', avatarId: 'slate' },
  { name: 'Juniper', avatarId: 'juniper' },
  { name: 'Cobalt', avatarId: 'cobalt' },
  { name: 'Plum', avatarId: 'plum' },
  { name: 'Rust', avatarId: 'rust' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface PresidentPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface PresidentTransportOptions {
  mode: PresidentModeId;
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: PresidentRules;
  seats: number;
  seed: number;
  player: { name: string; avatarId: string };
  botTier?: BotTier;
}

export interface PresidentSnapshot {
  mode: PresidentModeId;
  players: readonly PresidentPlayer[];
  session: GameSession<PresidentState, PresidentRules>;
  matchWinner: number | null;
}

export interface PresidentDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: PresidentSnapshot;
}

/**
 * In-process authority for solo President. One deterministic multi-deal match
 * of @parlour/game-president against house bots; the React table only renders
 * snapshots. Mirrors WildTransport's contract so table pages rhyme.
 */
export class PresidentTransport {
  private readonly def = presidentGame;
  private readonly options: PresidentTransportOptions;
  private readonly policy;
  private session: GameSession<PresidentState, PresidentRules>;

  constructor(options: PresidentTransportOptions) {
    if (
      !Number.isInteger(options.seats) ||
      options.seats < MIN_SEATS ||
      options.seats > MAX_SEATS
    ) {
      throw new Error(`president requires ${MIN_SEATS}–${MAX_SEATS} seats`);
    }
    this.options = options;
    this.policy = presidentBots[(options.botTier ?? 2) - 1]!;
    this.session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
  }

  getSnapshot(): PresidentSnapshot {
    return {
      mode: this.options.mode,
      players: this.players(),
      session: this.session,
      matchWinner: this.session.result?.winner ?? null,
    };
  }

  legalMoves(): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    const phase = this.session.phase;
    return this.def.flow.legalMoves(this.session.state, phase);
  }

  /** Human seat 0 acts; the engine validates actor/turn/phase legality. */
  dispatch(move: string, payload?: unknown): PresidentDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('match-ended', 'the match has ended');
    }
    const outcome = sessionApply(this.def, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return { events: outcome.events, fx: outcome.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  playBotTurn(): PresidentDispatch {
    const seat = this.session.phase.actor;
    if (this.session.status !== 'playing' || seat === null || seat === 0) {
      return this.reject('not-bot-turn', 'no bot is currently acting');
    }
    const policy = this.policy;
    const legal = this.def.flow.legalMovesFor
      ? this.def.flow.legalMovesFor(this.session.state, this.session.phase, seat)
      : this.def.flow.legalMoves(this.session.state, this.session.phase);
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(this.options.seed).fork(`event:${this.session.log.length}`);
    const choice =
      chooseBotMove(policy, this.def.playerView(this.session.state, seat), seat, legal, rng) ??
      legal[0]!;
    const applied = sessionApply(this.def, this.session, seat, choice.id, choice.payload);
    if (applied.rejected) {
      throw new Error(`${policy.id} chose ${choice.id}: ${applied.rejected.message}`);
    }
    this.session = applied.session;
    return { events: applied.events, fx: applied.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  playBotsUntilHuman(): PresidentDispatch[] {
    const outcomes: PresidentDispatch[] = [];
    let guard = 0;
    while (this.session.status === 'playing' && this.session.phase.actor !== 0) {
      if (guard++ >= 2000) throw new Error('bot loop did not return control after 2000 actions');
      if (this.session.phase.actor === null) break;
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  private players(): PresidentPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...PRESIDENT_BOTS[index % PRESIDENT_BOTS.length]!,
        isBot: true,
      })),
    ];
  }

  private reject(code: string, message: string): PresidentDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }
}

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
import { wildpileGame, type WildpileRules, type WildpileState } from '@parlour/game-wildpile';
import type { WildModeId } from '@/lib/wild/modes';
import type { SeatCount } from '@/stores/setup';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const WILD_BOTS = [
  { name: 'Slate', avatarId: 'slate' },
  { name: 'Marigold', avatarId: 'marigold' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface WildPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface WildTransportOptions {
  mode: WildModeId;
  seats: SeatCount;
  seed: number;
  player: { name: string; avatarId: string };
}

export interface WildSnapshot {
  mode: WildModeId;
  players: readonly WildPlayer[];
  session: GameSession<WildpileState, WildpileRules>;
  /** Wild is a single deal: the first emptied hand wins the match. */
  matchWinner: number | null;
}

export interface WildDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: WildSnapshot;
}

/**
 * In-process authority for solo Wild. One deterministic deal of
 * @parlour/game-wildpile against the house bot; the React table only renders
 * its snapshots. Mirrors LocalTransport's contract so the table pages rhyme.
 */
export class WildTransport {
  private readonly def = wildpileGame;
  private readonly options: WildTransportOptions;
  private session: GameSession<WildpileState, WildpileRules>;

  constructor(options: WildTransportOptions) {
    this.options = options;
    this.session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
  }

  getSnapshot(): WildSnapshot {
    return {
      mode: this.options.mode,
      players: this.players(),
      session: this.session,
      matchWinner: this.session.result?.winner ?? null,
    };
  }

  legalMoves(): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    return this.def.flow.legalMoves(this.session.state, this.session.phase);
  }

  /** Human seat 0 acts; the engine validates actor/turn/interrupt legality. */
  dispatch(move: string, payload?: unknown): WildDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('match-ended', 'the match has ended');
    }
    const outcome = sessionApply(this.def, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return { events: outcome.events, fx: outcome.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  playBotTurn(): WildDispatch {
    const seat = this.session.phase.actor;
    if (this.session.status !== 'playing' || seat === null || seat === 0) {
      return this.reject('not-bot-turn', 'no bot is currently acting');
    }
    const policy = this.def.bots?.[0];
    if (!policy) throw new Error('wildpile ships no bot policy');
    const legal = this.def.flow.legalMoves(this.session.state, this.session.phase);
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

  playBotsUntilHuman(): WildDispatch[] {
    const outcomes: WildDispatch[] = [];
    let guard = 0;
    while (this.session.status === 'playing' && this.session.phase.actor !== 0) {
      if (guard++ >= 500) throw new Error('bot loop did not return control after 500 actions');
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  private players(): WildPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...WILD_BOTS[index % WILD_BOTS.length]!,
        isBot: true,
      })),
    ];
  }

  private reject(code: string, message: string): WildDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }
}

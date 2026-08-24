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
  createGinMatchDef,
  ginConfigSchema,
  GIN_PERSONAS,
  makeGinPersonaBot,
  type GinConfig,
  type GinMatchState,
  type PersonaDef,
} from '@parlour/game-gin';
import type { BotPolicy } from '@parlour/engine';
import type { GinModeId } from '@/lib/gin/modes';
import type { BotTier } from '@/stores/setup';

/** House opponents — avatar ids match the app's cast so seats read cohesively. */
const PERSONA_AVATARS = ['peg', 'roo', 'marge', 'benny', 'knuckles', 'pat'] as const;

export interface GinPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface GinTransportOptions {
  mode: GinModeId;
  botTier: BotTier;
  seed: number;
  player: { name: string; avatarId: string };
}

export interface GinSnapshot {
  mode: GinModeId;
  players: readonly GinPlayer[];
  session: GameSession<GinMatchState, GinConfig>;
  /** null while the match is still live */
  matchWinner: number | null;
}

export interface GinDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: GinSnapshot;
}

/**
 * In-process authority for solo Gin. One deterministic match of
 * @parlour/game-gin against a house persona; the React table only renders its
 * snapshots. The bot answers the hand-end ready window instantly, so pacing
 * stays in the human's hands.
 */
export class GinTransport {
  private readonly def = createGinMatchDef();
  private readonly options: GinTransportOptions;
  /** the persona's hand-level brain */
  private readonly handPolicy: ReturnType<typeof makeGinPersonaBot>;
  /** the same brain adapted to match-level views (answers `ready` instantly) */
  private readonly policy: BotPolicy<GinMatchState> & { persona: PersonaDef };
  private session: GameSession<GinMatchState, GinConfig>;

  constructor(options: GinTransportOptions) {
    this.options = options;
    this.handPolicy = makeGinPersonaBot(personaForTier(options.botTier));
    const hand = this.handPolicy;
    this.policy = {
      id: hand.id,
      label: hand.label,
      tier: hand.tier,
      persona: hand.persona,
      chooseMove(view, seat, legal, rng, ctx) {
        if (view.folded) return legal.find((move) => move.id === 'ready') ?? null;
        return hand.chooseMove(view.hand, seat, legal, rng, ctx);
      },
    };
    this.session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(ginConfigSchema, options.mode),
      seats: 2,
    });
  }

  getSnapshot(): GinSnapshot {
    return {
      mode: this.options.mode,
      players: this.players(),
      session: this.session,
      matchWinner: this.session.result?.winner ?? null,
    };
  }

  /** Moves the seat that must act right now may choose from. */
  legalMoves(): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    const actor = this.session.phase.actor;
    if (actor === null) return [];
    return this.def.flow.legalMovesFor!(this.session.state, this.session.phase, actor);
  }

  /** Human seat 0 acts; the engine validates turn and legality. */
  dispatch(move: string, payload?: unknown): GinDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('match-ended', 'the match has ended');
    }
    const outcome = sessionApply(this.def, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return { events: outcome.events, fx: outcome.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  playBotTurn(): GinDispatch {
    const seat = this.session.phase.actor;
    if (this.session.status !== 'playing' || seat === null || seat === 0) {
      return this.reject('not-bot-turn', 'no bot is currently acting');
    }
    const legal = this.def.flow.legalMovesFor!(this.session.state, this.session.phase, seat);
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(this.options.seed).fork(
      `hand:${this.session.state.handIndex}:ev:${this.session.log.length}`,
    );
    const view = this.def.playerView(this.session.state, seat);
    const choice = chooseBotMove(this.policy, view, seat, legal, rng) ?? legal[0]!;
    return this.apply(seat, choice.id, choice.payload);
  }

  /** Plays every bot decision until the human's seat must act again. */
  playBotsUntilHuman(): GinDispatch[] {
    const outcomes: GinDispatch[] = [];
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

  private apply(seat: number, move: string, payload?: unknown): GinDispatch {
    const applied = sessionApply(this.def, this.session, seat, move, payload);
    if (applied.rejected) throw new Error(`${move}: ${applied.rejected.message}`);
    this.session = applied.session;
    return { events: applied.events, fx: applied.fx, rejected: null, snapshot: this.getSnapshot() };
  }

  private players(): GinPlayer[] {
    const personaIndex = Math.max(
      0,
      GIN_PERSONAS.findIndex((candidate: PersonaDef) => candidate.id === this.policy.persona.id),
    );
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      {
        seat: 1,
        name: this.policy.persona.name,
        avatarId: PERSONA_AVATARS[personaIndex % PERSONA_AVATARS.length] ?? 'peg',
        isBot: true,
      },
    ];
  }

  private reject(code: string, message: string): GinDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }
}

function personaForTier(tier: BotTier): string {
  const pool = GIN_PERSONAS.filter((candidate: PersonaDef) => candidate.tier === tier);
  if (pool.length === 0) throw new Error(`no gin personas for tier ${tier}`);
  return pool[0]!.id;
}

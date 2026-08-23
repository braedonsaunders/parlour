import {
  Fx,
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
  PERSONAS,
  blitzConfigSchema,
  createBlitzDef,
  makePersonaBot,
  type BlitzConfig,
  type BlitzState,
  type PersonaDef,
} from '@parlour/game-blitz';
import type { ModeId } from '@/lib/modes';
import type { BotTier, SeatCount } from '@/stores/setup';

const STARTING_LIVES = 3;
const FIRST_TO_WINS = 3;
const TIMED_DURATION_MS = 180_000;
const PERSONA_AVATARS = ['juniper', 'cobalt', 'plum', 'marigold', 'rust', 'slate'] as const;

export interface SoloPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
  personaId?: string;
}

export interface LocalTransportOptions {
  mode: ModeId;
  seats: SeatCount;
  botTier: BotTier;
  seed: number;
  player: { name: string; avatarId: string };
  startedAtMs?: number;
}

export interface SoloSnapshot {
  mode: ModeId;
  round: number;
  players: readonly SoloPlayer[];
  session: GameSession<BlitzState, BlitzConfig>;
  lives: readonly number[];
  wins: readonly number[];
  metrics: readonly MatchMetrics[];
  startedAtMs: number;
  durationMs: number | null;
  matchWinner: number | null;
}

export interface MatchMetrics {
  blitzes: number;
  knocks: number;
  knockWins: number;
}

export interface LocalDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: SoloSnapshot;
}

type Listener = (outcome: LocalDispatch) => void;

/**
 * In-process authority for solo play. It composes deterministic Blitz rounds
 * into the three match formats; the React table only renders its snapshots.
 */
export class LocalTransport {
  private readonly def = createBlitzDef();
  private readonly options: LocalTransportOptions;
  private readonly policies: ReturnType<typeof makePersonaBot>[];
  private readonly listeners = new Set<Listener>();
  private session: GameSession<BlitzState, BlitzConfig>;
  private round = 1;
  private lives: number[];
  private wins: number[];
  private metrics: MatchMetrics[];
  private matchWinner: number | null = null;
  private roundScored = false;

  constructor(options: LocalTransportOptions) {
    this.options = options;
    const personas = personasForTier(options.botTier);
    this.policies = Array.from({ length: options.seats - 1 }, (_, index) =>
      makePersonaBot(personas[index % personas.length]!.id),
    );
    this.lives = Array.from({ length: options.seats }, () => STARTING_LIVES);
    this.wins = Array.from({ length: options.seats }, () => 0);
    this.metrics = Array.from({ length: options.seats }, () => ({
      blitzes: 0,
      knocks: 0,
      knockWins: 0,
    }));
    this.session = this.createRound();
    if (this.session.status === 'ended') {
      const fx = [...(this.session.setupFx ?? [])];
      this.scoreRound(fx);
      this.session = { ...this.session, setupFx: fx };
    }
  }

  getSnapshot(): SoloSnapshot {
    return {
      mode: this.options.mode,
      round: this.round,
      players: this.players(),
      session: this.session,
      lives: this.lives,
      wins: this.wins,
      metrics: this.metrics.map((metric) => ({ ...metric })),
      startedAtMs: this.options.startedAtMs ?? 0,
      durationMs: this.options.mode === 'timed' ? TIMED_DURATION_MS : null,
      matchWinner: this.matchWinner,
    };
  }

  legalMoves(): readonly LegalMove[] {
    if (this.matchWinner !== null || this.session.status !== 'playing') return [];
    return this.def.flow.legalMoves(this.session.state, this.session.phase);
  }

  dispatch(move: string, payload?: unknown): LocalDispatch {
    if (this.matchWinner !== null) return this.reject('match-ended', 'the match has ended');
    const outcome = sessionApply(this.def, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    const fx = [...outcome.fx];
    if (this.session.status === 'ended') this.scoreRound(fx);
    return this.publish({
      events: outcome.events,
      fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  playBotsUntilHuman(): LocalDispatch[] {
    const outcomes: LocalDispatch[] = [];
    let guard = 0;
    while (
      this.matchWinner === null &&
      this.session.status === 'playing' &&
      this.session.phase.actor !== 0
    ) {
      if (guard++ >= 100) throw new Error('bot loop did not return control after 100 actions');
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  playBotTurn(): LocalDispatch {
    const seat = this.session.phase.actor;
    if (this.session.status !== 'playing' || seat === null || seat === 0) {
      return this.reject('not-bot-turn', 'no bot is currently acting');
    }
    const policy = this.policies[seat - 1];
    if (!policy) throw new Error(`no bot policy for seat ${seat}`);
    const legal = this.def.flow.legalMoves(this.session.state, this.session.phase);
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(this.options.seed).fork(
      `round:${this.round}:event:${this.session.log.length}`,
    );
    const choice =
      chooseBotMove(policy, this.def.playerView(this.session.state, seat), seat, legal, rng) ??
      legal[0]!;
    const applied = sessionApply(this.def, this.session, seat, choice.id, choice.payload);
    if (applied.rejected) {
      throw new Error(`${policy.id} chose ${choice.id}: ${applied.rejected.message}`);
    }
    this.session = applied.session;
    const fx = [...applied.fx];
    if (this.session.status === 'ended') this.scoreRound(fx);
    return this.publish({
      events: applied.events,
      fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  startNextRound(): LocalDispatch {
    if (this.session.status !== 'ended')
      return this.reject('round-playing', 'the round is not over');
    if (this.matchWinner !== null) return this.reject('match-ended', 'the match has ended');
    this.round += 1;
    this.roundScored = false;
    this.session = this.createRound();
    const fx = [...(this.session.setupFx ?? [])];
    if (this.session.status === 'ended') this.scoreRound(fx);
    return this.publish({ events: [], fx, rejected: null, snapshot: this.getSnapshot() });
  }

  tick(nowMs: number): SoloSnapshot {
    if (this.options.mode !== 'timed' || this.matchWinner !== null) return this.getSnapshot();
    const startedAt = this.options.startedAtMs ?? 0;
    if (nowMs < startedAt + TIMED_DURATION_MS) return this.getSnapshot();
    const best = Math.max(...this.wins);
    const leaders = this.wins.flatMap((wins, seat) => (wins === best ? [seat] : []));
    if (leaders.length === 1) this.matchWinner = leaders[0]!;
    return this.getSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private createRound(): GameSession<BlitzState, BlitzConfig> {
    return createSession(this.def, {
      seed: (this.options.seed + (this.round - 1) * 9_973) | 0,
      config: blitzConfigSchema.defaults(),
      seats: this.options.seats,
    });
  }

  private players(): SoloPlayer[] {
    const bots = this.policies.map((policy, index) => ({
      seat: index + 1,
      name: policy.persona.name,
      avatarId: PERSONA_AVATARS[PERSONAS.findIndex((p) => p.id === policy.persona.id)] ?? 'slate',
      isBot: true,
      personaId: policy.persona.id,
    }));
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...bots,
    ];
  }

  private scoreRound(fx: FxEvent[]): void {
    if (this.roundScored) return;
    this.roundScored = true;
    const outcome = this.session.state.outcome;
    const winners =
      outcome?.winners ??
      (this.session.result?.winner === null ? [] : [this.session.result?.winner]);

    if (outcome?.reason === 'blitz') {
      for (const winner of winners) {
        if (winner !== undefined) this.metrics[winner]!.blitzes += 1;
      }
    }
    const knocker = this.session.state.knocker;
    if (knocker !== null) {
      this.metrics[knocker]!.knocks += 1;
      if (winners.includes(knocker)) this.metrics[knocker]!.knockWins += 1;
    }

    if (this.options.mode === 'classic') {
      const losers =
        outcome?.reason === 'blitz'
          ? this.lives.flatMap((_lives, seat) => (winners.includes(seat) ? [] : [seat]))
          : lowestRankedSeats(outcome?.rankings ?? []);
      for (const seat of losers) {
        this.lives[seat] = Math.max(0, (this.lives[seat] ?? 0) - 1);
        fx.push({ kind: Fx.ChipLoss, payload: { seat, livesLeft: this.lives[seat] } });
      }
      const standing = this.lives.flatMap((lives, seat) => (lives > 0 ? [seat] : []));
      if (standing.length === 1) this.matchWinner = standing[0]!;
      return;
    }

    for (const winner of winners) {
      if (winner !== undefined) this.wins[winner] = (this.wins[winner] ?? 0) + 1;
    }
    if (this.options.mode === 'fast') {
      const winner = this.wins.findIndex((wins) => wins >= FIRST_TO_WINS);
      if (winner >= 0) this.matchWinner = winner;
    }
  }

  private reject(code: string, message: string): LocalDispatch {
    return {
      events: [],
      fx: [],
      rejected: { code, message },
      snapshot: this.getSnapshot(),
    };
  }

  private publish(outcome: LocalDispatch): LocalDispatch {
    for (const listener of this.listeners) listener(outcome);
    return outcome;
  }
}

function personasForTier(tier: BotTier): PersonaDef[] {
  const exact = PERSONAS.filter((persona) => persona.tier === tier);
  if (exact.length === 0) throw new Error(`no personas for bot tier ${tier}`);
  return exact;
}

function lowestRankedSeats(rankings: readonly { seat: number; rank: number }[]): number[] {
  if (rankings.length === 0) return [];
  const lowestRank = Math.max(...rankings.map(({ rank }) => rank));
  return rankings.flatMap(({ seat, rank }) => (rank === lowestRank ? [seat] : []));
}

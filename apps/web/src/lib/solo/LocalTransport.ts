import { Fx, createSession, type FxEvent, type GameSession, type LegalMove } from '@parlour/engine';
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
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

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

export type LocalDispatch = SoloDispatch<SoloSnapshot>;

type BlitzSession = GameSession<BlitzState, BlitzConfig>;

/**
 * In-process authority for solo play. It composes deterministic Blitz rounds
 * into the three match formats; the React table only renders its snapshots.
 */
export class LocalTransport {
  private readonly def = createBlitzDef();
  private readonly options: LocalTransportOptions;
  private readonly policies: ReturnType<typeof makePersonaBot>[];
  private readonly authority: SoloAuthority<BlitzSession, SoloSnapshot, BlitzState>;
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
    let session = this.createRound();
    if (session.status === 'ended') {
      const fx = [...(session.setupFx ?? [])];
      this.scoreRound(session, fx);
      session = { ...session, setupFx: fx };
    }
    this.authority = new SoloAuthority(
      {
        snapshot: (live): SoloSnapshot => ({
          mode: options.mode,
          round: this.round,
          players: this.players(),
          session: live,
          lives: this.lives,
          wins: this.wins,
          metrics: this.metrics.map((metric) => ({ ...metric })),
          startedAtMs: options.startedAtMs ?? 0,
          durationMs: options.mode === 'timed' ? TIMED_DURATION_MS : null,
          matchWinner: this.matchWinner,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing' && this.matchWinner === null,
        blockDispatch: () =>
          this.matchWinner !== null
            ? { code: 'match-ended', message: 'the match has ended' }
            : null,
        afterApply: ({ live, fx }) => {
          if (live.status === 'ended') this.scoreRound(live, fx);
        },
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live) => this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: (seat) => {
            const policy = this.policies[seat - 1];
            if (!policy) throw new Error(`no bot policy for seat ${seat}`);
            return policy;
          },
          rngFork: (live) => `round:${this.round}:event:${live.log.length}`,
          untilHumanGuard: 100,
        },
      },
      session,
    );
  }

  getSnapshot(): SoloSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (this.matchWinner !== null || session.status !== 'playing') return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): LocalDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotsUntilHuman(): LocalDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  playBotTurn(): LocalDispatch {
    return this.authority.playBotTurn();
  }

  startNextRound(): LocalDispatch {
    const session = this.authority.getLive();
    if (session.status !== 'ended') {
      return this.authority.reject('round-playing', 'the round is not over');
    }
    if (this.matchWinner !== null) {
      return this.authority.reject('match-ended', 'the match has ended');
    }
    this.round += 1;
    this.roundScored = false;
    const next = this.createRound();
    const fx = [...(next.setupFx ?? [])];
    return this.authority.accept({ live: next, events: [], fx });
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

  subscribe(listener: (outcome: LocalDispatch) => void): () => void {
    return this.authority.subscribe(listener);
  }

  private createRound(): BlitzSession {
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

  private scoreRound(session: BlitzSession, fx: FxEvent[]): void {
    if (this.roundScored) return;
    this.roundScored = true;
    const outcome = session.state.outcome;
    const winners =
      outcome?.winners ?? (session.result?.winner === null ? [] : [session.result?.winner]);

    if (outcome?.reason === 'blitz') {
      for (const winner of winners) {
        if (winner !== undefined) this.metrics[winner]!.blitzes += 1;
      }
    }
    const knocker = session.state.knocker;
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

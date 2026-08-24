import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  PERSONAS,
  makePersonaBot,
  spiteConfig,
  spiteGame,
  type SpiteRules,
  type SpiteState,
} from '@parlour/game-spite';
import type { SpiteModeId } from '@/lib/spite/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

export interface SpitePlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface SpiteTransportOptions {
  mode: SpiteModeId;
  seed: number;
  player: { name: string; avatarId: string };
  seats?: number;
  botTier?: BotTier;
}

export interface SpiteSnapshot {
  mode: SpiteModeId;
  players: readonly SpitePlayer[];
  session: GameSession<SpiteState, SpiteRules>;
  won: boolean | null;
}

export type SpiteDispatch = SoloDispatch<SpiteSnapshot>;

/**
 * In-process authority for solo Spite & Malice. One deterministic race to an
 * empty payoff pile; the facade only projects snapshots and seats the house.
 */
export class SpiteTransport {
  private readonly def = spiteGame;
  private readonly options: SpiteTransportOptions;
  private readonly cast: readonly { name: string; avatarId: string; personaId: string }[];
  private readonly authority: SoloAuthority<
    GameSession<SpiteState, SpiteRules>,
    SpiteSnapshot,
    SpiteState
  >;

  constructor(options: SpiteTransportOptions) {
    this.options = options;
    const seats = options.seats ?? 2;
    this.cast = castFor(options.botTier ?? 2, seats - 1);
    const policies = new Map(
      this.cast.map((member, index) => [index + 1, makePersonaBot(member.personaId)]),
    );

    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(spiteConfig, options.mode),
      seats,
    });

    this.authority = new SoloAuthority(
      {
        snapshot: (live): SpiteSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          won: live.result === null ? null : live.result.winner === 0,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live) => this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: (seat) => policies.get(seat) ?? makePersonaBot(PERSONAS[0]!.id),
          rngFork: (live) => `turn:${live.state.turn}:event:${live.log.length}`,
          untilHumanGuard: 800,
        },
      },
      session,
    );
  }

  getSnapshot(): SpiteSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const seat = session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): SpiteDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): SpiteDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): SpiteDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): SpitePlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...this.cast.map((member, index) => ({
        seat: index + 1,
        name: member.name,
        avatarId: member.avatarId,
        isBot: true,
      })),
    ];
  }
}

function castFor(
  tier: BotTier,
  count: number,
): { name: string; avatarId: string; personaId: string }[] {
  const preferred = PERSONAS.filter((persona) => persona.tier === tier);
  const rest = PERSONAS.filter((persona) => persona.tier !== tier).sort(
    (left, right) => Math.abs(left.tier - tier) - Math.abs(right.tier - tier),
  );
  return [...preferred, ...rest].slice(0, Math.max(0, count)).map((persona) => ({
    name: persona.name,
    avatarId: persona.avatar,
    personaId: persona.id,
  }));
}

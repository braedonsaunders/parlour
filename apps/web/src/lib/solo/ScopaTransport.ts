import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  PERSONAS,
  createScopaDef,
  makePersonaBot,
  scopaConfig,
  type ScopaPlayerView,
  type ScopaRules,
  type ScopaState,
} from '@parlour/game-scopa';
import { scopaPresetFor, type ScopaModeId } from '@/lib/scopa/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

export interface ScopaPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface ScopaTransportOptions {
  mode: ScopaModeId;
  seed: number;
  player: { name: string; avatarId: string };
  seats?: number;
  botTier?: BotTier;
}

export interface ScopaSnapshot {
  mode: ScopaModeId;
  players: readonly ScopaPlayer[];
  session: GameSession<ScopaState, ScopaRules>;
  won: boolean | null;
}

export type ScopaDispatch = SoloDispatch<ScopaSnapshot>;

/**
 * In-process authority for solo Scopa. The whole match — every round, the
 * captured piles and the running score — lives inside one deterministic engine
 * session, so this facade only projects snapshots and seats the house.
 */
export class ScopaTransport {
  private readonly def = createScopaDef();
  private readonly options: ScopaTransportOptions;
  private readonly cast: readonly { name: string; avatarId: string; personaId: string }[];
  private readonly authority: SoloAuthority<
    GameSession<ScopaState, ScopaRules>,
    ScopaSnapshot,
    ScopaPlayerView
  >;

  constructor(options: ScopaTransportOptions) {
    this.options = options;
    const seats = options.mode === 'scopone' ? 4 : (options.seats ?? 4);
    this.cast = castFor(options.botTier ?? 2, seats - 1);
    const policies = new Map(
      this.cast.map((member, index) => [index + 1, makePersonaBot(member.personaId)]),
    );

    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(scopaConfig, scopaPresetFor(options.mode)),
      seats,
    });

    this.authority = new SoloAuthority(
      {
        snapshot: (live): ScopaSnapshot => ({
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
          rngFork: (live) => `round:${live.state.roundNo}:event:${live.log.length}`,
          untilHumanGuard: 500,
        },
      },
      session,
    );
  }

  getSnapshot(): ScopaSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const seat = session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): ScopaDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): ScopaDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): ScopaDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): ScopaPlayer[] {
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

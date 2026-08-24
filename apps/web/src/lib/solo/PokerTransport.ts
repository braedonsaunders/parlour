import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  PERSONAS,
  createPokerDef,
  makePersonaBot,
  type PokerPlayerView,
  type PokerRules,
  type PokerState,
} from '@parlour/game-poker';
import type { PokerModeId } from '@/lib/poker/modes';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

export interface PokerSoloPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface PokerTransportOptions {
  mode: PokerModeId;
  seed: number;
  player: { name: string; avatarId: string };
  /** total seats at the table, the human included */
  seats?: number;
  /** bot tier for the house seats (default medium) */
  botTier?: 1 | 2 | 3;
}

export interface PokerSnapshot {
  mode: PokerModeId;
  players: readonly PokerSoloPlayer[];
  session: GameSession<PokerState, PokerRules>;
  won: boolean | null;
}

export type PokerDispatch = SoloDispatch<PokerSnapshot>;

/**
 * In-process authority for solo poker. The whole sit-and-go — every hand, the
 * stacks, the blind ladder and the bust order — lives inside one deterministic
 * engine session, so this facade only projects snapshots and seats the house.
 *
 * Bots are drawn from the persona list at the chosen tier rather than three
 * copies of one policy: at a poker table the difference between opponents is
 * most of the game, and a table of identical bots plays like one opponent with
 * four seats.
 */
export class PokerTransport {
  private readonly def = createPokerDef();
  private readonly options: PokerTransportOptions;
  private readonly cast: readonly { name: string; avatarId: string; personaId: string }[];
  private readonly authority: SoloAuthority<
    GameSession<PokerState, PokerRules>,
    PokerSnapshot,
    PokerPlayerView
  >;

  constructor(options: PokerTransportOptions) {
    this.options = options;
    const seats = options.seats ?? 4;
    const tier = options.botTier ?? 2;
    this.cast = castFor(tier, seats - 1);

    const policies = new Map(
      this.cast.map((member, index) => [
        index + 1,
        makePersonaBot(PERSONAS.find((persona) => persona.id === member.personaId) ?? PERSONAS[0]!),
      ]),
    );

    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, options.mode),
      seats,
    });

    this.authority = new SoloAuthority(
      {
        snapshot: (live): PokerSnapshot => ({
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
          policy: (seat) => policies.get(seat) ?? makePersonaBot(PERSONAS[0]!),
          rngFork: (live) => `hand:${live.state.handNo}:event:${live.log.length}`,
          untilHumanGuard: 500,
        },
      },
      session,
    );
  }

  getSnapshot(): PokerSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const seat = session.phase.actor;
    if (seat === null || seat !== 0) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): PokerDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): PokerDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): PokerDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): PokerSoloPlayer[] {
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

/**
 * Seats the house, preferring personas at the chosen tier and topping up from
 * the neighbouring ones so a six-handed table is never three of the same face.
 */
function castFor(
  tier: 1 | 2 | 3,
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

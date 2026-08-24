import {
  applyPreset,
  createSession,
  type BotPolicy,
  type GameSession,
  type LegalMove,
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
import type { GinModeId } from '@/lib/gin/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

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

export type GinDispatch = SoloDispatch<GinSnapshot>;

/**
 * In-process authority for solo Gin. One deterministic match of
 * @parlour/game-gin against a house persona; the bot answers the hand-end
 * ready window instantly, so pacing stays in the human's hands.
 */
export class GinTransport {
  private readonly def = createGinMatchDef();
  private readonly options: GinTransportOptions;
  private readonly policy: BotPolicy<GinMatchState> & { persona: PersonaDef };
  private readonly authority: SoloAuthority<
    GameSession<GinMatchState, GinConfig>,
    GinSnapshot,
    GinMatchState
  >;

  constructor(options: GinTransportOptions) {
    this.options = options;
    const handPolicy = makeGinPersonaBot(personaForTier(options.botTier));
    this.policy = {
      id: handPolicy.id,
      label: handPolicy.label,
      tier: handPolicy.tier,
      persona: handPolicy.persona,
      chooseMove(view, seat, legal, rng, ctx) {
        if (view.folded) return legal.find((move) => move.id === 'ready') ?? null;
        return handPolicy.chooseMove(view.hand, seat, legal, rng, ctx);
      },
    };
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(ginConfigSchema, options.mode),
      seats: 2,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): GinSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live, seat) => this.def.flow.legalMovesFor!(live.state, live.phase, seat),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => this.policy,
          rngFork: (live) => `hand:${live.state.handIndex}:ev:${live.log.length}`,
          untilHumanGuard: 500,
          botRejectedMessage: ({ choice, rejected }) => `${choice.id}: ${rejected.message}`,
        },
      },
      session,
    );
  }

  getSnapshot(): GinSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves the seat that must act right now may choose from. */
  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const actor = session.phase.actor;
    if (actor === null) return [];
    return this.def.flow.legalMovesFor!(session.state, session.phase, actor);
  }

  dispatch(move: string, payload?: unknown): GinDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): GinDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): GinDispatch[] {
    return this.authority.playBotsUntilHuman();
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
}

function personaForTier(tier: BotTier): string {
  const pool = GIN_PERSONAS.filter((candidate: PersonaDef) => candidate.tier === tier);
  if (pool.length === 0) throw new Error(`no gin personas for tier ${tier}`);
  return pool[0]!.id;
}

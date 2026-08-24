import {
  applyPreset,
  createMatch,
  matchNextRound,
  type LegalMove,
  type MatchSession,
} from '@parlour/engine';
import {
  PERSONAS,
  createOhHellMatchDef,
  makePersonaBot,
  ohhellConfig,
  type OhHellMatchState,
  type OhHellRules,
  type OhHellState,
} from '@parlour/game-ohhell';
import type { OhHellModeId } from '@/lib/ohhell/modes';
import type { BotTier } from '@/stores/setup';
import { adaptMatchApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

export interface OhHellPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface OhHellTransportOptions {
  mode: OhHellModeId;
  seed: number;
  player: { name: string; avatarId: string };
  seats?: number;
  botTier?: BotTier;
}

export type OhHellMatchSession = MatchSession<OhHellState, OhHellRules, OhHellMatchState>;

export interface OhHellSnapshot {
  mode: OhHellModeId;
  players: readonly OhHellPlayer[];
  match: OhHellMatchSession;
}

export type OhHellDispatch = SoloDispatch<OhHellSnapshot>;

/**
 * In-process authority for solo Oh Hell.
 *
 * Oh Hell is a schedule of rounds whose hand size changes every deal, so unlike
 * most of the shelf it is a `MatchSession` rather than one long game session:
 * each round is its own engine session and the match owns only the running
 * score. `afterApply` rolls straight into the next deal, which is why the table
 * never has to ask anyone to press continue.
 */
export class OhHellTransport {
  private readonly def = createOhHellMatchDef();
  private readonly options: OhHellTransportOptions;
  private readonly cast: readonly { name: string; avatarId: string; personaId: string }[];
  private readonly authority: SoloAuthority<OhHellMatchSession, OhHellSnapshot, OhHellState>;

  constructor(options: OhHellTransportOptions) {
    this.options = options;
    const seats = options.seats ?? 4;
    const tier = options.botTier ?? 2;
    this.cast = castFor(tier, seats - 1);

    const policies = new Map(
      this.cast.map((member, index) => [index + 1, makePersonaBot(member.personaId)]),
    );

    const match = createMatch(this.def, {
      seed: options.seed | 0,
      config: applyPreset(ohhellConfig, options.mode),
      seats,
    }).session;

    this.authority = new SoloAuthority(
      {
        snapshot: (live): OhHellSnapshot => ({
          mode: options.mode,
          players: this.players(),
          match: live,
        }),
        apply: adaptMatchApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        afterApply: ({ live, events, fx }) => {
          if (live.status !== 'round-over') return;
          const next = matchNextRound(this.def, live);
          if (next.rejected) throw new Error(next.rejected.message);
          return {
            live: next.session,
            events: [...events, ...next.events],
            fx: [...fx, ...next.fx],
          };
        },
        bots: {
          seed: options.seed,
          actor: (live) => {
            if (live.status !== 'playing') return null;
            const seat = live.round.phase.actor;
            return seat !== null && seat !== 0 ? seat : null;
          },
          legalMoves: (live, seat) => this.legalMovesOn(live, seat),
          playerView: (live, seat) => this.def.game.playerView(live.round.state, seat),
          policy: (seat) => policies.get(seat) ?? makePersonaBot(PERSONAS[0]!.id),
          rngFork: (live) => `round:${live.roundIndex}:event:${live.round.log.length}`,
          untilHumanGuard: 500,
        },
      },
      match,
    );
  }

  getSnapshot(): OhHellSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(seat = 0): readonly LegalMove[] {
    return this.legalMovesOn(this.authority.getLive(), seat);
  }

  dispatch(move: string, payload?: unknown): OhHellDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): OhHellDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): OhHellDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private legalMovesOn(match: OhHellMatchSession, seat: number): readonly LegalMove[] {
    if (match.status !== 'playing') return [];
    const { round } = match;
    return (
      round.def.flow.legalMovesFor?.(round.state, round.phase, seat) ??
      (round.phase.actor === seat ? round.def.flow.legalMoves(round.state, round.phase) : [])
    );
  }

  private players(): OhHellPlayer[] {
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

/** Seats the house from the personas at this tier, topping up from the rest. */
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

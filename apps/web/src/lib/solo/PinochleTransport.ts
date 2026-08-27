import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createPinochleDef,
  tierBot,
  type PinochleRules,
  type PinochleState,
} from '@parlour/game-pinochle';
import type { PinochleModeId } from '@/lib/pinochle/modes';
import {
  adaptSessionApply,
  sessionLegalMoves,
  SoloAuthority,
  type SoloDispatch,
} from './SoloAuthority';
import { houseSeats, winningTeamOf } from './seating';

/** House partners and opponents sit in table order around seat 0. */
const PINOCHLE_CAST = [
  { name: 'Gus', avatarId: 'rust' },
  { name: 'Fran', avatarId: 'cobalt' },
  { name: 'Lou', avatarId: 'slate' },
] as const;

export interface PinochleSoloPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface PinochleTransportOptions {
  mode: PinochleModeId;
  seed: number;
  player: { name: string; avatarId: string };
  /** bot tier for the three house seats (default medium) */
  botTier?: 1 | 2 | 3;
}

export interface PinochleSnapshot {
  mode: PinochleModeId;
  players: readonly PinochleSoloPlayer[];
  session: GameSession<PinochleState, PinochleRules>;
  matchWinnerTeam: 0 | 1 | null;
}

export type PinochleDispatch = SoloDispatch<PinochleSnapshot>;

/**
 * The seat with a pending decision, or null when nobody owes one.
 *
 * Bidding, naming trump and playing a card are all single-actor turns keyed on
 * `state.turn`. Melding is not: every seat confirms its own meld independently
 * of whose turn it is (see `legalMovesForSeat` in the pack's rules, which gates
 * `confirmMeld` on `!state.meldConfirmed[seat]` rather than on `turn`), so the
 * pending seat there is the first one that has not yet confirmed — exactly the
 * same shape as Hearts' simultaneous pass phase.
 */
function pendingActor(state: PinochleState): number | null {
  if (state.stage === 'melding') {
    const seat = state.meldConfirmed.findIndex((confirmed) => !confirmed);
    return seat >= 0 ? seat : null;
  }
  if (state.stage === 'bidding' || state.stage === 'naming-trump' || state.stage === 'playing') {
    return state.turn;
  }
  // hand-over / redeal: the system moves itself, nobody is waiting on a seat.
  return null;
}

/**
 * In-process authority for solo pinochle. The full match — every hand, bid,
 * meld and trump call — lives inside one deterministic engine session, so this
 * facade only projects snapshots and names the house seats.
 */
export class PinochleTransport {
  private readonly def = createPinochleDef();
  private readonly options: PinochleTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<PinochleState, PinochleRules>,
    PinochleSnapshot,
    PinochleState
  >;

  constructor(options: PinochleTransportOptions) {
    this.options = options;
    const policy = tierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: applyPreset(this.def.configSchema, presetForMode(options.mode)),
      seats: 4,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): PinochleSnapshot => ({
          mode: options.mode,
          players: houseSeats(options.player, PINOCHLE_CAST),
          session: live,
          matchWinnerTeam: winningTeamOf(live),
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => pendingActor(live.state),
          legalMoves: (live, seat) =>
            this.def.flow.legalMovesFor?.(live.state, live.phase, seat) ?? [],
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => policy,
          rngFork: (live) => `hand:${live.state.handNo}:event:${live.log.length}`,
          untilHumanGuard: 500,
        },
      },
      session,
    );
  }

  getSnapshot(): PinochleSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves offered to the human seat right now — empty while others act. */
  legalMoves(): readonly LegalMove[] {
    return sessionLegalMoves(this.def, this.authority.getLive(), 0);
  }

  dispatch(move: string, payload?: unknown): PinochleDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): PinochleDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): PinochleDispatch[] {
    return this.authority.playBotsUntilHuman();
  }
}

const MODE_PRESETS: Record<PinochleModeId, string> = {
  classic: 'classic',
  quick: 'quick',
  marathon: 'marathon',
};

function presetForMode(mode: PinochleModeId): string {
  return MODE_PRESETS[mode];
}

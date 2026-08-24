import type { LegalMove } from '@parlour/engine';
import type { RatscrewConfig, SlapPattern } from '@parlour/game-ratscrew';
import type {
  RatscrewState,
  RatscrewWindow,
} from '@parlour/game-ratscrew';
import { getRatscrewMode, type RatscrewModeId } from '@/lib/ratscrew/modes';

export interface RatscrewSeatView {
  seat: number;
  name: string;
  avatarId: string;
  stackCount: number;
  isLocal: boolean;
  isBot: boolean;
}

export interface RatscrewTableView {
  players: readonly RatscrewSeatView[];
  localSeat: number;
  /** Seat owing the next flip, or null while a slap race is live. */
  turnSeat: number | null;
  /** Top-first, capped for the pile display. */
  center: readonly string[];
  centerCount: number;
  window: {
    pattern: SlapPattern;
    /** ms elapsed since the window opened at the authority, when known */
    elapsedMs: number | null;
    durationMs: number;
  } | null;
  challenge: { challenger: number; target: number; chancesLeft: number } | null;
  phaseLabel: string;
  mode: RatscrewModeId;
  status: 'playing' | 'ended';
  winnerSeat: number | null;
  decision: 'flip' | 'slap' | null;
  legal: {
    flip: boolean;
    slap: boolean;
  };
}

const PATTERN_LABEL: Record<SlapPattern, string> = {
  double: 'Double!',
  sandwich: 'Sandwich!',
  marriage: 'Marriage!',
  ten: 'Ten!',
  'top-bottom': 'Top-bottom!',
  run: 'Run!',
};

/** Human-readable label for a live pattern (banner copy). */
export function slapPatternLabel(pattern: SlapPattern): string {
  return PATTERN_LABEL[pattern];
}

function windowView(
  window: RatscrewWindow | null,
  config: Pick<RatscrewConfig, 'slapWindowMs'>,
): RatscrewTableView['window'] {
  if (!window) return null;
  return {
    pattern: window.pattern,
    elapsedMs: window.openedAtMs,
    durationMs: config.slapWindowMs,
  };
}

/**
 * Pure snapshot → render model for the Rat Screw table. `legal` must be the
 * moves the transport currently offers the local seat; while bots race it
 * should still include the risk-slap whenever burns are on.
 */
export function ratscrewTableView(
  snapshot: {
    mode: RatscrewModeId;
    players: readonly { seat: number; name: string; avatarId: string; isBot: boolean }[];
    session: { state: RatscrewState; status: 'playing' | 'ended'; result: { winner: number | null } | null };
  },
  legal: readonly LegalMove[],
  localSeat = 0,
): RatscrewTableView {
  const state = snapshot.session.state;
  const playing = snapshot.session.status === 'playing';
  const offered = playing ? legal : [];
  const canFlip = offered.some((move) => move.id === 'flip');
  const canSlap = offered.some((move) => move.id === 'slap');
  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      // counts are public even though faces are not — playerView masks faces
      stackCount: state.piles[player.seat]?.length ?? 0,
      isLocal: player.seat === localSeat,
      isBot: player.isBot,
    })),
    turnSeat: state.window ? null : state.turn,
    center: state.center.slice(-3).reverse(),
    centerCount: state.center.length,
    window: windowView(state.window, state.rules),
    challenge: state.challenge ? { ...state.challenge } : null,
    phaseLabel: phaseLabel(state),
    mode: getRatscrewMode(snapshot.mode).id,
    status: snapshot.session.status,
    winnerSeat: snapshot.session.result?.winner ?? null,
    decision: canFlip ? 'flip' : canSlap ? 'slap' : null,
    legal: {
      flip: canFlip,
      slap: canSlap,
    },
  };
}

function phaseLabel(state: RatscrewState): string {
  if (state.window) return `${state.center.length} cards · SLAP!`;
  if (state.challenge) {
    const face = state.challenge.chancesLeft;
    return `challenge · ${face} chance${face === 1 ? '' : 's'} left`;
  }
  return `${state.center.length} cards on the pile`;
}

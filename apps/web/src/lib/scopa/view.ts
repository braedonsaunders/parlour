import type { GameSession, LegalMove } from '@parlour/engine';
import type { RoundSummary, ScopaRules, ScopaStage, ScopaState } from '@parlour/game-scopa';
import type { ScopaModeId } from '@/lib/scopa/modes';

export interface ScopaSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  handCount: number;
  /** cards taken so far this round — public in Scopa, everyone saw them go */
  captured: number;
  scope: number;
  score: number;
}

/** One legal way to play a single card from hand. */
export interface ScopaPlayOption {
  card: string;
  /** table cards this play would take; empty means posing the card instead */
  take: readonly string[];
}

export interface ScopaTableView {
  players: readonly ScopaSeatView[];
  localSeat: number;
  activeSeat: number | null;
  stage: ScopaStage;
  stageLabel: string;
  roundNo: number;
  dealer: number;
  /** face-up cards waiting to be taken */
  table: readonly string[];
  stockCount: number;
  hand: readonly string[];
  /** every legal play, grouped by the hand card that makes it */
  options: readonly ScopaPlayOption[];
  /** hand cards with at least one legal play right now */
  playableCards: readonly string[];
  /** true while it is this device's turn to play */
  yourTurn: boolean;
  lastRound: RoundSummary | null;
  target: number;
  matchOver: boolean;
  won: boolean | null;
  mode: ScopaModeId;
  rules: ScopaRules;
}

export interface ScopaSnapshot {
  mode: ScopaModeId;
  players: readonly { seat: number; name: string; avatarId: string; isBot: boolean }[];
  session: GameSession<ScopaState, ScopaRules>;
  won: boolean | null;
}

const STAGE_LABELS: Readonly<Record<ScopaStage, string>> = {
  playing: 'Playing',
  'round-over': 'Round over',
};

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/**
 * Every option for one card, ordered so the table reads sensibly: the biggest
 * capture first, and posing the card last. A player choosing between takes is
 * almost always choosing the one that clears the most.
 */
export function optionsForCard(
  options: readonly ScopaPlayOption[],
  card: string,
): ScopaPlayOption[] {
  return options
    .filter((option) => option.card === card)
    .sort((left, right) => right.take.length - left.take.length);
}

/**
 * Pure snapshot → render model for the Scopa table. `legal` must be the moves
 * offered to the viewing seat; pass [] while others act.
 */
export function scopaTableView(
  snapshot: ScopaSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): ScopaTableView {
  const session = snapshot.session;
  const state = session.state;
  const playing = session.status === 'playing';
  const yourTurn = playing && state.turn === localSeat && state.stage === 'playing';
  const offered = yourTurn ? legal : [];

  const options: ScopaPlayOption[] = offered
    .filter((move) => move.id === 'playCard')
    .map((move) => {
      const payload = payloadOf(move);
      const take = Array.isArray(payload.take) ? (payload.take as string[]) : [];
      return { card: String(payload.card ?? ''), take };
    })
    .filter((option) => option.card.length > 0);

  const players: ScopaSeatView[] = snapshot.players.map((player) => {
    const seat = player.seat;
    return {
      seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: seat === localSeat,
      isBot: player.isBot,
      isDealer: seat === state.dealer,
      isTurn: playing && state.turn === seat && state.stage === 'playing',
      handCount: (state.hands[seat] ?? []).length,
      captured: (state.captures[seat] ?? []).length,
      scope: state.scope[seat] ?? 0,
      score: state.scores[seat] ?? 0,
    };
  });

  return {
    players,
    localSeat,
    activeSeat: playing && state.stage === 'playing' ? state.turn : null,
    stage: state.stage,
    stageLabel: STAGE_LABELS[state.stage],
    roundNo: state.roundNo,
    dealer: state.dealer,
    table: [...state.table],
    stockCount: state.stock.length,
    hand: (state.hands[localSeat] ?? []).filter((card) => card !== '??'),
    options,
    playableCards: [...new Set(options.map((option) => option.card))],
    yourTurn,
    lastRound: state.summary ?? state.lastRound,
    target: state.rules.target,
    matchOver: session.status !== 'playing',
    won: snapshot.won,
    mode: snapshot.mode,
    rules: state.rules,
  };
}

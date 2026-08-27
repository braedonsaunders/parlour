import type { FxEvent, LegalMove } from '@parlour/engine';
import type { DurakSuit } from '@parlour/game-durak';
import { getDurakMode, type DurakModeId } from '@/lib/durak/modes';
import type { DurakSnapshot } from '@/lib/solo/DurakTransport';

export type DurakDecision = 'attack' | 'defend' | null;

export interface DurakSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  isLocal: boolean;
  isBot: boolean;
  isAttacker: boolean;
  isDefender: boolean;
  isOut: boolean;
  passed: boolean;
}

export interface DurakTablePairView {
  attack: string;
  defend: string | null;
}

export interface DurakDefendOption {
  attack: string;
  card: string;
}

export interface DurakOutcomeView {
  loser: number | null;
  loserName: string | null;
  order: readonly number[];
}

export interface DurakTableView {
  players: readonly DurakSeatView[];
  localSeat: number;
  attacker: number;
  defender: number;
  /** Seats with something to decide right now — plural during the attack window. */
  actingSeats: readonly number[];
  phaseLabel: string;
  trumpSuit: DurakSuit;
  /** Always readable, even under Veil — the one card every room turns face up. */
  trumpCard: string;
  stockCount: number;
  table: readonly DurakTablePairView[];
  hand: readonly string[];
  /** The local seat's pending decision, or null while others act. */
  decision: DurakDecision;
  legal: {
    attackCards: readonly string[];
    defendOptions: readonly DurakDefendOption[];
    transferCards: readonly string[];
    takeCards: boolean;
    pass: boolean;
  };
  outcome: DurakOutcomeView | null;
  matchOver: boolean;
}

function payloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function payloadAttack(move: LegalMove): string | null {
  const attack = (move.payload as { attack?: unknown } | undefined)?.attack;
  return typeof attack === 'string' ? attack : null;
}

/**
 * Pure snapshot → render model for the Durak table. `legal` must be the moves
 * the transport currently offers `localSeat`; while others act it should be
 * empty.
 */
export function durakTableView(
  snapshot: DurakSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): DurakTableView {
  const { session } = snapshot;
  const state = session.state;
  const actingSeats =
    session.status === 'playing'
      ? (session.phase.actors ?? (session.phase.actor !== null ? [session.phase.actor] : []))
      : [];
  const acting = actingSeats.includes(localSeat);
  const offered = acting ? legal : [];

  const players: DurakSeatView[] = snapshot.players.map((player) => ({
    seat: player.seat,
    name: player.name,
    avatarId: player.avatarId,
    handCount: state.hands[player.seat]?.length ?? 0,
    isLocal: player.seat === localSeat,
    isBot: player.isBot,
    isAttacker: state.attacker === player.seat,
    isDefender: state.defender === player.seat,
    isOut: state.out.includes(player.seat),
    passed: state.passed.includes(player.seat),
  }));

  const outcome = state.outcome
    ? {
        loser: state.outcome.loser,
        loserName:
          state.outcome.loser === null
            ? null
            : (players.find((p) => p.seat === state.outcome!.loser)?.name ?? null),
        order: state.outcome.order,
      }
    : null;

  return {
    players,
    localSeat,
    attacker: state.attacker,
    defender: state.defender,
    actingSeats,
    phaseLabel: phaseLabel(snapshot.mode, session.phase.phase),
    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard,
    stockCount: state.stock.length,
    table: state.table.map((pair) => ({ attack: pair.attack, defend: pair.defend })),
    hand: state.hands[localSeat] ?? [],
    decision: acting ? (session.phase.phase === 'defend' ? 'defend' : 'attack') : null,
    legal: {
      attackCards: offered.flatMap((move) => {
        if (move.id !== 'attack') return [];
        const card = payloadCard(move);
        return card ? [card] : [];
      }),
      defendOptions: offered.flatMap((move) => {
        if (move.id !== 'defend') return [];
        const attack = payloadAttack(move);
        const card = payloadCard(move);
        return attack && card ? [{ attack, card }] : [];
      }),
      transferCards: offered.flatMap((move) => {
        if (move.id !== 'transfer') return [];
        const card = payloadCard(move);
        return card ? [card] : [];
      }),
      takeCards: offered.some((move) => move.id === 'takeCards'),
      pass: offered.some((move) => move.id === 'pass'),
    },
    outcome,
    matchOver: session.status === 'ended' || snapshot.matchWinner !== null,
  };
}

function phaseLabel(mode: DurakModeId, phase: string): string {
  const name = getDurakMode(mode).name.toLowerCase();
  if (phase === 'defend') return `${name} · beat it or take it`;
  if (phase === 'over') return `${name} · hand over`;
  return `${name} · attack`;
}

// ---------------------------------------------------------------------------
// centre-table calls
// ---------------------------------------------------------------------------

export type DurakAnnouncementKind = 'attack' | 'throw-in' | 'beat' | 'pickup' | 'transfer' | 'out';

export interface DurakAnnouncement {
  id: string;
  kind: DurakAnnouncementKind;
  text: string;
  detail: string | null;
  seat: number | null;
  atMs: number;
}

const ANNOUNCEMENT_ORDER: readonly DurakAnnouncementKind[] = [
  'out',
  'pickup',
  'transfer',
  'beat',
  'throw-in',
  'attack',
];

/**
 * Turns the pack's namespaced effects into table calls — the same job
 * `eightsAnnouncements` does for Crazy Eights.
 */
export function durakAnnouncements(
  fx: readonly FxEvent[],
  players: readonly DurakSeatView[],
): DurakAnnouncement[] {
  const nameOf = (seat: number | null): string | null => {
    if (seat === null) return null;
    const player = players.find((entry) => entry.seat === seat);
    if (!player) return null;
    return player.isLocal ? 'You' : player.name;
  };

  const calls = fx.flatMap((event, index): DurakAnnouncement[] => {
    const atMs = Math.max(0, event.at ?? 0);
    const seat = numberField(event, 'seat');
    const base = { id: `${index}:${event.kind}`, atMs, seat };
    switch (event.kind) {
      case 'durak.throwIn':
        return [
          { ...base, kind: 'throw-in', text: 'Thrown in', detail: `${nameOf(seat)} adds a card` },
        ];
      case 'durak.beat':
        return [
          { ...base, kind: 'beat', text: 'Beat', detail: `${nameOf(seat)} beats the attack` },
        ];
      case 'durak.pickup': {
        const count = numberField(event, 'cards') ?? 0;
        return [
          {
            ...base,
            kind: 'pickup',
            text: 'Takes the table',
            detail: `${nameOf(seat)} picks up ${count} card${count === 1 ? '' : 's'}`,
          },
        ];
      }
      case 'durak.transfer': {
        const to = numberField(event, 'to');
        return [
          {
            ...base,
            kind: 'transfer',
            text: 'Transferred',
            detail: `${nameOf(seat)} passes it to ${nameOf(to) ?? 'the next seat'}`,
          },
        ];
      }
      case 'durak.out':
        return [{ ...base, kind: 'out', text: 'Out!', detail: `${nameOf(seat)} is clear` }];
      default:
        return [];
    }
  });

  return calls.sort(
    (a, b) => ANNOUNCEMENT_ORDER.indexOf(a.kind) - ANNOUNCEMENT_ORDER.indexOf(b.kind),
  );
}

function payloadOf(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

function numberField(event: FxEvent, field: string): number | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

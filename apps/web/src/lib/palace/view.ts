import type { FxEvent, LegalMove } from '@parlour/engine';
import { activeLayer, type PalaceLayer } from '@parlour/game-palace';
import type { PalaceSnapshot } from '@/lib/solo/PalaceTransport';

export type PalaceDecision = 'swap' | 'play' | null;

export interface PalaceSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  handCount: number;
  /** Face-up cards are public furniture — real ids for every seat. */
  up: readonly string[];
  downCount: number;
  roundsWon: number;
  swapped: boolean;
  readied: boolean;
}

export interface PalaceTableView {
  players: readonly PalaceSeatView[];
  localSeat: number;
  activeSeat: number | null;
  roundNumber: number;
  winsTo: number;
  phaseLabel: string;
  /** Centre pile, oldest first. */
  pile: readonly string[];
  /** The rank the next play must equal or beat, or null while the table is open. */
  floor: number | null;
  burnCount: number;
  hand: readonly string[];
  /** The local seat's active layer, or null once it has emptied every zone. */
  layer: PalaceLayer | null;
  decision: PalaceDecision;
  legal: {
    /** Cards from the local seat's active layer that may lead a play right now. */
    playableCards: readonly string[];
    pickup: boolean;
    playDown: boolean;
    swap: boolean;
    ready: boolean;
  };
  matchOver: boolean;
}

function payloadCards(move: LegalMove): readonly string[] {
  const raw = (move.payload as { cards?: unknown } | undefined)?.cards;
  return Array.isArray(raw) ? raw.filter((card): card is string => typeof card === 'string') : [];
}

function phaseLabel(roundNumber: number, winsTo: number, phase: string): string {
  if (phase === 'swap') return `round ${roundNumber} · swap & ready`;
  if (phase === 'ended') return `first to ${winsTo} round wins`;
  return `round ${roundNumber} · first to ${winsTo}`;
}

/**
 * Pure snapshot → render model for the Palace table. `legal` must be the
 * moves the transport currently offers `localSeat`; while others act it
 * should be empty.
 */
export function palaceTableView(
  snapshot: PalaceSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): PalaceTableView {
  const { session } = snapshot;
  const state = session.state;
  const acting =
    session.status === 'playing' &&
    ((session.phase.actors ?? []).includes(localSeat) || session.phase.actor === localSeat);
  const offered = acting ? legal : [];

  const players: PalaceSeatView[] = snapshot.players.map((player) => ({
    seat: player.seat,
    name: player.name,
    avatarId: player.avatarId,
    isLocal: player.seat === localSeat,
    isBot: player.isBot,
    handCount: state.hands[player.seat]?.length ?? 0,
    up: state.up[player.seat] ?? [],
    downCount: state.down[player.seat]?.length ?? 0,
    roundsWon: state.roundsWon[player.seat] ?? 0,
    swapped: state.swapped.includes(player.seat),
    readied: state.readied.includes(player.seat),
  }));

  return {
    players,
    localSeat,
    activeSeat: session.phase.actor,
    roundNumber: state.round + 1,
    winsTo: state.rules.winsTo,
    phaseLabel: phaseLabel(state.round + 1, state.rules.winsTo, session.phase.phase),
    pile: state.pile,
    floor: state.floor,
    burnCount: state.burn.length,
    hand: state.hands[localSeat] ?? [],
    layer: activeLayer(state, localSeat),
    decision: acting ? (session.phase.phase === 'swap' ? 'swap' : 'play') : null,
    legal: {
      playableCards: offered.flatMap((move) => (move.id === 'playCards' ? payloadCards(move) : [])),
      pickup: offered.some((move) => move.id === 'pickup'),
      playDown: offered.some((move) => move.id === 'playDown'),
      swap: offered.some((move) => move.id === 'swap'),
      ready: offered.some((move) => move.id === 'ready'),
    },
    matchOver: session.status === 'ended' || snapshot.matchWinner !== null,
  };
}

// ---------------------------------------------------------------------------
// centre-table calls
// ---------------------------------------------------------------------------

export type PalaceAnnouncementKind = 'burn' | 'pickup' | 'out';

export interface PalaceAnnouncement {
  id: string;
  kind: PalaceAnnouncementKind;
  text: string;
  detail: string | null;
  seat: number | null;
  atMs: number;
}

const ANNOUNCEMENT_ORDER: readonly PalaceAnnouncementKind[] = ['out', 'burn', 'pickup'];

/** Turns the pack's namespaced effects into table calls. */
export function palaceAnnouncements(
  fx: readonly FxEvent[],
  players: readonly PalaceSeatView[],
): PalaceAnnouncement[] {
  const nameOf = (seat: number | null): string | null => {
    if (seat === null) return null;
    const player = players.find((entry) => entry.seat === seat);
    if (!player) return null;
    return player.isLocal ? 'You' : player.name;
  };

  const calls = fx.flatMap((event, index): PalaceAnnouncement[] => {
    const atMs = Math.max(0, event.at ?? 0);
    const seat = numberField(event, 'seat');
    const base = { id: `${index}:${event.kind}`, atMs, seat };
    switch (event.kind) {
      case 'palace.burn': {
        const reason = stringField(event, 'reason');
        return [
          {
            ...base,
            kind: 'burn',
            text: 'Burn!',
            detail:
              reason === 'four-kind'
                ? `Four of a kind — ${nameOf(seat)} plays again`
                : `${nameOf(seat)} plays again`,
          },
        ];
      }
      case 'palace.pickup': {
        const reason = stringField(event, 'reason');
        return [
          {
            ...base,
            kind: 'pickup',
            text: reason === 'down-miss' ? 'No good!' : 'Picked up',
            detail: `${nameOf(seat)} takes the pile`,
          },
        ];
      }
      case 'palace.out':
        return [
          {
            ...base,
            kind: 'out',
            text: 'Out!',
            detail: `${nameOf(seat)} cleared the table`,
          },
        ];
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

function stringField(event: FxEvent, field: string): string | null {
  const value = payloadOf(event)?.[field];
  return typeof value === 'string' ? value : null;
}

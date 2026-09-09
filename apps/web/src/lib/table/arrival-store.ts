import type { FxCue } from './fx-motion';

type InboundCue = Extract<FxCue, { type: 'draw' | 'transfer' }>;
type OutboundCue = Extract<FxCue, { type: 'discard' | 'trick-play' | 'layoff' | 'transfer' }>;

export type ArrivalState = {
  /** Face stays hidden until the flyer covers the slot. */
  arriving: ReadonlySet<string>;
  /** Kept out of the fan until the flight is close enough to need a gap. */
  pending: ReadonlySet<string>;
  /** Still occupying its slot so a discard can leave from that card. */
  departing: ReadonlySet<string>;
};

export type ArrivalAdmission = {
  pending: ReadonlySet<string>;
  departing: ReadonlySet<string>;
};

const EMPTY: ReadonlySet<string> = new Set();
export const DEFAULT_ARRIVAL: ArrivalState = { arriving: EMPTY, pending: EMPTY, departing: EMPTY };
const DEFAULT_ADMISSION: ArrivalAdmission = { pending: EMPTY, departing: EMPTY };

export type ArrivalStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ArrivalState;
  getAdmission: () => ArrivalAdmission;
  arrivingHas: (cardId: string) => boolean;
  departingHas: (cardId: string) => boolean;
  isReceiving: () => boolean;
  prepare: (
    fxKey: string | number,
    inbound: readonly InboundCue[],
    outbound: readonly OutboundCue[],
  ) => void;
  /**
   * Incoming cards whose flight has been accepted but not started — the
   * animation queue's backlog. The state that moved them already landed, so
   * until their burst goes on screen they are held out of the fan exactly as
   * if their own cue were running.
   *
   * Inbound only, deliberately. The mirror case is tempting — hold a played
   * card IN the fan until its flight leaves — but the failure modes are not
   * mirrored: withholding a card that has arrived shows it a beat late, while
   * holding one that has gone strands an element the game state says is not
   * there. Measured on the veiled friend-room suite, that turned a 2-in-6
   * flake into 7-in-8: the card the test had just played was still sitting in
   * the hand.
   */
  setWaiting: (inboundCards: readonly string[]) => void;
  flushPrepare: () => void;
  open: (cardId: string) => void;
  land: (cardId: string) => void;
  depart: (cardId: string) => void;
  settleAll: (inboundCards: readonly string[], outboundCards: readonly string[]) => void;
};

export function createArrivalStore(): ArrivalStore {
  let fxKey: string | number | null = null;
  let inbound: readonly InboundCue[] = [];
  let outbound: readonly OutboundCue[] = [];
  let opened: ReadonlySet<string> = EMPTY;
  let landed: ReadonlySet<string> = EMPTY;
  let departed: ReadonlySet<string> = EMPTY;
  let waitingIn: ReadonlySet<string> = EMPTY;
  let snapshot: ArrivalState = DEFAULT_ARRIVAL;
  let admission: ArrivalAdmission = DEFAULT_ADMISSION;
  let published: ArrivalState = DEFAULT_ARRIVAL;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function emit(): void {
    published = snapshot;
    for (const listener of listeners) listener();
  }

  function recompute(): ArrivalState {
    if (inbound.length === 0 && outbound.length === 0 && waitingIn.size === 0) {
      snapshot = DEFAULT_ARRIVAL;
      admission = DEFAULT_ADMISSION;
      return snapshot;
    }
    const arriving = new Set<string>();
    const pending = new Set<string>();
    const nextDeparting = new Set<string>();
    for (const cue of inbound) {
      if (!landed.has(cue.card)) arriving.add(cue.card);
      if (!opened.has(cue.card)) pending.add(cue.card);
    }
    for (const cue of outbound) {
      if (!departed.has(cue.card)) nextDeparting.add(cue.card);
    }
    // A queued burst has no clock of its own: its cards stay out of the fan
    // until the burst is published and its own cues take the hold over.
    for (const card of waitingIn) pending.add(card);
    if (
      sameSet(snapshot.arriving, arriving) &&
      sameSet(snapshot.pending, pending) &&
      sameSet(snapshot.departing, nextDeparting)
    ) {
      return snapshot;
    }
    snapshot = { arriving, pending, departing: nextDeparting };
    if (!sameSet(admission.pending, pending) || !sameSet(admission.departing, nextDeparting)) {
      admission = { pending, departing: nextDeparting };
    }
    return snapshot;
  }

  function prepare(
    nextKey: string | number,
    nextInbound: readonly InboundCue[],
    nextOutbound: readonly OutboundCue[],
  ): void {
    if (fxKey === nextKey && inbound === nextInbound && outbound === nextOutbound) return;
    if (fxKey !== nextKey) {
      fxKey = nextKey;
      opened = EMPTY;
      landed = EMPTY;
      departed = EMPTY;
    }
    inbound = nextInbound;
    outbound = nextOutbound;
    recompute();
  }

  function setWaiting(inboundCards: readonly string[]): void {
    const nextIn = inboundCards.length === 0 ? EMPTY : new Set(inboundCards);
    if (sameSet(waitingIn, nextIn)) return;
    waitingIn = nextIn;
    recompute();
  }

  function flushPrepare(): void {
    if (published === snapshot) return;
    emit();
  }

  function open(cardId: string): void {
    const next = new Set(opened);
    next.add(cardId);
    opened = next;
    recompute();
    emit();
  }

  function land(cardId: string): void {
    const next = new Set(landed);
    next.add(cardId);
    landed = next;
    recompute();
    emit();
  }

  function depart(cardId: string): void {
    const next = new Set(departed);
    next.add(cardId);
    departed = next;
    recompute();
    emit();
  }

  function settleAll(inboundCards: readonly string[], outboundCards: readonly string[]): void {
    opened = new Set(inboundCards);
    landed = opened;
    departed = new Set(outboundCards);
    recompute();
    emit();
  }

  return {
    subscribe,
    getSnapshot: () => snapshot,
    getAdmission: () => admission,
    arrivingHas: (cardId) => snapshot.arriving.has(cardId),
    departingHas: (cardId) => snapshot.departing.has(cardId),
    isReceiving: () => snapshot.arriving.size > 0,
    prepare,
    setWaiting,
    flushPrepare,
    open,
    land,
    depart,
    settleAll,
  };
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

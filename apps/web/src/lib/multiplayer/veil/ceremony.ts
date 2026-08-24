/**
 * The Veil shuffle ceremony and the private deal that follows it.
 *
 * The ceremony runs once per deck epoch: seats take turns encrypting the whole
 * deck under their own commutative layer and permuting it, in seat order. When
 * the last seat is done, the deck is a list of opaque group elements that
 * nobody can map to cards — the position of a card is known to no one, because
 * every seat's permutation was applied on top of a deck it could not read.
 *
 * Dealing a card privately then costs one round of *partial decryptions*: every
 * seat except the recipient removes its own layer and passes the still-locked
 * value along. Only the recipient can take off the final layer, so only the
 * recipient learns the face. Opening a card in public is the same thing with
 * the recipient's share published too.
 *
 * A recycled discard pile starts a new epoch: the cards are public, so they are
 * re-encoded and shuffled again, which hides the new order without pretending
 * the table has forgotten which cards are in there.
 */

import { elementFromHex, elementToHex } from './sra';
import {
  buildCodebook,
  decodeCard,
  decryptElement,
  generateLayerKey,
  randomPermutation,
  shuffleLayer,
  type VeilCodebook,
  type VeilLayerKey,
} from './sra';
import { hashTagged } from './hash';

/** One seat's contribution to one epoch, broadcast as a transcript entry. */
export interface VeilLayerEntry {
  epoch: number;
  seat: number;
  /** the deck as it stands after this seat's layer and permutation */
  deck: readonly string[];
  /** commits to the layer key and permutation without revealing either */
  commitment: string;
}

/** A seat's share of one card's decryption. */
export interface VeilShare {
  epoch: number;
  /** deck position being opened */
  position: number;
  seat: number;
  /** the value with this seat's layer removed */
  value: string;
}

/** What a seat keeps to itself until the audit. */
export interface VeilLayerSecret {
  epoch: number;
  key: VeilLayerKey;
  order: readonly number[];
  /** random opening for the commitment */
  salt: string;
}

export interface VeilEpoch {
  epoch: number;
  /** card ids this epoch shuffles, in canonical order */
  cards: readonly string[];
  codebook: VeilCodebook;
  /** the deck after every seat has laid its layer, or null while the ceremony runs */
  deck: readonly string[] | null;
  /** seat order the layers were applied in */
  layers: VeilLayerEntry[];
  /** first veil-handle index this epoch's positions map to */
  handleBase: number;
}

export function roundIdFor(roomCode: string, seed: number, epoch: number): string {
  return `${roomCode}:${seed >>> 0}:${epoch}`;
}

export async function commitLayer(secret: VeilLayerSecret): Promise<string> {
  return hashTagged('layer-commitment', {
    epoch: secret.epoch,
    e: secret.key.e.toString(16),
    order: [...secret.order],
    salt: secret.salt,
  });
}

/** Starts an epoch from the card ids that belong in it. */
export async function openEpoch(
  epoch: number,
  roundId: string,
  cards: readonly string[],
  handleBase: number,
): Promise<VeilEpoch> {
  if (new Set(cards).size !== cards.length) throw new Error('epoch cards must be distinct');
  return {
    epoch,
    cards: [...cards],
    codebook: await buildCodebook(roundId, cards),
    deck: null,
    layers: [],
    handleBase,
  };
}

/** The cleartext starting deck every seat can compute for itself. */
export function baseDeck(epoch: VeilEpoch): string[] {
  return epoch.cards.map((card) => {
    const element = epoch.codebook.elementOf.get(card);
    if (element === undefined) throw new Error(`card ${card} is not in this epoch`);
    return elementToHex(element);
  });
}

export interface LayerResult {
  entry: VeilLayerEntry;
  secret: VeilLayerSecret;
}

/**
 * Lays this seat's layer on the deck as it stands. `input` is the base deck for
 * the first seat, and the previous seat's published deck after that.
 */
export async function layShuffleLayer(
  epoch: VeilEpoch,
  seat: number,
  input: readonly string[],
  random: (length: number) => Uint8Array,
): Promise<LayerResult> {
  if (input.length !== epoch.cards.length) throw new Error('shuffle input is the wrong size');
  const key = generateLayerKey(random);
  const order = randomPermutation(input.length, random);
  const salt = toHexString(random(16));
  const deck = shuffleLayer(input.map(elementFromHex), key, order).map(elementToHex);
  const secret: VeilLayerSecret = { epoch: epoch.epoch, key, order, salt };
  return {
    entry: { epoch: epoch.epoch, seat, deck, commitment: await commitLayer(secret) },
    secret,
  };
}

function toHexString(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export type CeremonyFault =
  | { code: 'out-of-turn'; message: string }
  | { code: 'wrong-size'; message: string }
  | { code: 'not-a-group-element'; message: string }
  | { code: 'duplicate-element'; message: string }
  | { code: 'unchanged-deck'; message: string };

/**
 * Structural checks a published layer must pass before it extends the epoch.
 *
 * None of these prove the seat *shuffled* rather than substituted cards — a
 * shuffle argument is the one thing this protocol deliberately defers to the
 * match-end audit. They do catch every cheap attack: laying a layer out of
 * turn, resizing the deck, sending values outside the group, collapsing two
 * positions onto one element, or passing the deck through untouched.
 */
export function checkLayer(
  epoch: VeilEpoch,
  entry: VeilLayerEntry,
  input: readonly string[],
  expectedSeat: number,
): CeremonyFault | null {
  if (entry.seat !== expectedSeat || entry.epoch !== epoch.epoch) {
    return { code: 'out-of-turn', message: `seat ${entry.seat} laid a layer out of turn` };
  }
  if (entry.deck.length !== epoch.cards.length) {
    return { code: 'wrong-size', message: 'the published deck changed size' };
  }
  const seen = new Set<string>();
  for (const element of entry.deck) {
    try {
      elementFromHex(element);
    } catch {
      return { code: 'not-a-group-element', message: 'the deck holds a value outside the group' };
    }
    if (seen.has(element)) {
      return { code: 'duplicate-element', message: 'the deck holds the same element twice' };
    }
    seen.add(element);
  }
  if (entry.deck.every((element, index) => element === input[index])) {
    return { code: 'unchanged-deck', message: 'the seat passed the deck through untouched' };
  }
  return null;
}

/** Applies a checked layer, and closes the epoch once every seat has gone. */
export function acceptLayer(epoch: VeilEpoch, entry: VeilLayerEntry, seats: number): VeilEpoch {
  const layers = [...epoch.layers, entry];
  return { ...epoch, layers, deck: layers.length === seats ? [...entry.deck] : null };
}

/** Removes this seat's layer from one position — its share of the decryption. */
export function shareFor(
  epoch: VeilEpoch,
  secret: VeilLayerSecret,
  position: number,
  locked: string,
  seat: number,
): VeilShare {
  if (secret.epoch !== epoch.epoch) throw new Error('layer secret belongs to another epoch');
  return {
    epoch: epoch.epoch,
    position,
    seat,
    value: elementToHex(decryptElement(elementFromHex(locked), secret.key)),
  };
}

export type OpenFault =
  { code: 'missing-shares'; message: string } | { code: 'not-a-card'; message: string };

/**
 * Finishes an opening once every seat's share has arrived, then reads the card.
 *
 * The shares chain: each is the previous value with one more layer removed, so
 * they must be applied in the order they were produced. A share computed with
 * the wrong exponent produces a value that decodes to no card at all, which is
 * how a dishonest partial decryption is caught immediately rather than at the
 * audit.
 */
export function finishOpen(
  epoch: VeilEpoch,
  shares: readonly VeilShare[],
  seats: number,
): { card: string } | OpenFault {
  const bySeat = new Map<number, VeilShare>();
  for (const share of shares) {
    if (share.epoch === epoch.epoch) bySeat.set(share.seat, share);
  }
  if (bySeat.size !== seats) {
    return {
      code: 'missing-shares',
      message: `opening needs ${seats} shares, has ${bySeat.size}`,
    };
  }
  const last = shares[shares.length - 1];
  if (!last) return { code: 'missing-shares', message: 'no shares supplied' };
  let opened: bigint;
  try {
    opened = elementFromHex(last.value);
  } catch {
    return { code: 'not-a-card', message: 'the final share is not a value in the group' };
  }
  const card = decodeCard(epoch.codebook, opened);
  if (!card) {
    return {
      code: 'not-a-card',
      message: 'the opened value is not a card in this deck — a share was computed dishonestly',
    };
  }
  return { card };
}

/** Deck position -> engine handle, and back. */
export function handleForPosition(epoch: VeilEpoch, position: number): string {
  return `v#${epoch.handleBase + position}`;
}

export function positionForHandle(epoch: VeilEpoch, handle: string): number | null {
  if (!handle.startsWith('v#')) return null;
  const index = Number(handle.slice(2));
  if (!Number.isInteger(index)) return null;
  const position = index - epoch.handleBase;
  return position >= 0 && position < epoch.cards.length ? position : null;
}

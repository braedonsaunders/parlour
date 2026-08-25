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
  type VeilCodebook,
  type VeilLayerKey,
} from './sra';
import { hashTagged } from './hash';
import { shuffleOffThread } from './shuffleClient';

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
  /** seats that contributed a layer to this epoch, in ceremony order */
  participants: readonly number[];
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
  participants: readonly number[] = [],
): Promise<VeilEpoch> {
  if (new Set(cards).size !== cards.length) throw new Error('epoch cards must be distinct');
  if (
    participants.some((seat) => !Number.isInteger(seat) || seat < 0) ||
    new Set(participants).size !== participants.length
  ) {
    throw new Error('epoch participants must be distinct seats');
  }
  return {
    epoch,
    cards: [...cards],
    codebook: await buildCodebook(roundId, cards),
    deck: null,
    layers: [],
    handleBase,
    participants: [...participants],
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
 * Draws a layer from a byte stream: the exponent, the permutation, the salt.
 *
 * Split out so that laying a layer and *rebuilding* one after a disconnect draw
 * in exactly the same order from exactly the same places. A seat that returns
 * derives this again from its own stream and checks the result against the
 * commitment already in the transcript — which only matches if every draw here
 * happened identically, so the two must never be allowed to drift apart.
 */
export function deriveLayerSecret(
  epoch: VeilEpoch,
  random: (length: number) => Uint8Array,
): VeilLayerSecret {
  const key = generateLayerKey(random);
  const order = randomPermutation(epoch.cards.length, random);
  const salt = toHexString(random(16));
  return { epoch: epoch.epoch, key, order, salt };
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
  const secret = deriveLayerSecret(epoch, random);
  // Off the main thread: a whole deck of modular exponentiations blocks
  // everything, including the heartbeat timer, and a table should not lose a
  // seat to its own shuffle. Falls back to a chunked in-thread run where there
  // is no worker to be had — see shuffleClient.
  const deck = await shuffleOffThread({
    deck: input,
    e: secret.key.e.toString(16),
    order: secret.order,
  });
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
export function acceptLayer(
  epoch: VeilEpoch,
  entry: VeilLayerEntry,
  seatsOrParticipants: number | readonly number[],
): VeilEpoch {
  const participants =
    epoch.participants.length > 0
      ? epoch.participants
      : typeof seatsOrParticipants === 'number'
        ? Array.from({ length: seatsOrParticipants }, (_, seat) => seat)
        : seatsOrParticipants;
  const layers = [...epoch.layers, entry];
  return {
    ...epoch,
    participants: [...participants],
    layers,
    deck: layers.length === participants.length ? [...entry.deck] : null,
  };
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
  | { code: 'missing-shares'; message: string }
  | { code: 'invalid-shares'; message: string }
  | { code: 'not-a-card'; message: string };

/**
 * Finishes an opening once every seat's share has arrived, then reads the card.
 *
 * The shares chain: each is the previous value with one more layer removed.
 * Network delivery may reorder the receipts, so the terminal share is the
 * unique value that decodes through this epoch's codebook. A wrong exponent
 * leaves no terminal card and is caught before the audit.
 */
export function finishOpen(
  epoch: VeilEpoch,
  shares: readonly VeilShare[],
  seats: number,
  requestedPosition = shares[0]?.position,
): { card: string } | OpenFault {
  const bySeat = new Map<number, VeilShare>();
  const expectedSeats =
    epoch.participants.length > 0 ? epoch.participants : epoch.layers.map((layer) => layer.seat);
  for (const share of shares) {
    if (
      share.epoch !== epoch.epoch ||
      share.position !== requestedPosition ||
      !expectedSeats.includes(share.seat) ||
      bySeat.has(share.seat)
    ) {
      return {
        code: 'invalid-shares',
        message: 'opening shares do not match one distinct peel from every participant',
      };
    }
    bySeat.set(share.seat, share);
  }
  if (expectedSeats.length !== seats || bySeat.size !== seats || shares.length !== seats) {
    return {
      code: 'missing-shares',
      message: `opening needs ${seats} shares, has ${bySeat.size}`,
    };
  }
  const decoded: string[] = [];
  for (const share of shares) {
    try {
      const card = decodeCard(epoch.codebook, elementFromHex(share.value));
      if (card) decoded.push(card);
    } catch {
      return { code: 'not-a-card', message: 'a share is not a value in the group' };
    }
  }
  if (decoded.length !== 1) {
    return {
      code: 'not-a-card',
      message: 'the peel did not produce one card in this deck — a share was computed dishonestly',
    };
  }
  return { card: decoded[0] as string };
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

/**
 * The after-match audit, and the four states a Veil result can carry.
 *
 * Veil detects cheating rather than preventing all of it. Nothing in the live
 * protocol proves a seat shuffled honestly instead of substituting cards, and
 * nothing proves a hidden-information claim ("I have 31") without opening the
 * hand. What the protocol does guarantee is that every step is recorded in one
 * signed chain, and that at match end every seat can disclose the layer secrets
 * needed to recompute the whole ceremony. If a seat cheated, the recomputation
 * does not reproduce the transcript and the result is marked `disputed`.
 *
 * That is why only `verified` results should ever feed a competitive ladder.
 * Local friends totals may show every state, with the badge visible.
 */

import { commitLayer, type VeilLayerEntry, type VeilLayerSecret } from './ceremony';
import { decryptElement, elementFromHex, elementToHex, shuffleLayer } from './sra';
import type { VeilCodebook } from './sra';
import type { SignedVeilEntry, VeilRoundHeader, VeilTranscript } from './transcript';

/**
 * `open` — the ordinary room; hands were readable by every peer's authority.
 * `veiled` — hands stayed private, but the audit did not complete.
 * `verified` — the transcript recomputed and every required claim held.
 * `disputed` — at least one check failed. Somebody's client is wrong or lying.
 */
export type VeilAuditState = 'open' | 'veiled' | 'verified' | 'disputed';

export interface AuditFinding {
  code: string;
  message: string;
  /** transcript entry the finding attaches to, when there is one */
  seq?: number;
  seat?: number;
}

export interface AuditReport {
  state: VeilAuditState;
  findings: readonly AuditFinding[];
  /** how many layers were recomputed from disclosed secrets */
  layersChecked: number;
  /** how many card openings were replayed */
  openingsChecked: number;
}

export interface DisclosedLayer {
  seat: number;
  secret: VeilLayerSecret;
}

export interface AuditInput {
  header: VeilRoundHeader;
  transcript: VeilTranscript;
  /** the deck each epoch started from, keyed by epoch */
  baseDecks: ReadonlyMap<number, readonly string[]>;
  codebooks: ReadonlyMap<number, VeilCodebook>;
  /** layer secrets each seat disclosed at match end */
  disclosed: readonly DisclosedLayer[];
  /** openings the room believes happened: handle, card and the epoch it came from */
  openings: readonly { epoch: number; position: number; card: string }[];
}

/**
 * Recomputes the ceremony from disclosed secrets and checks it against the
 * signed transcript, then re-derives every opening the room recorded.
 */
export async function auditRound(input: AuditInput): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  let layersChecked = 0;
  let openingsChecked = 0;

  const layerEntries = input.transcript.byKind<VeilLayerEntry>('ceremony.layer');
  const byEpoch = new Map<number, SignedVeilEntry<VeilLayerEntry>[]>();
  for (const entry of layerEntries) {
    const list = byEpoch.get(entry.payload.epoch) ?? [];
    list.push(entry);
    byEpoch.set(entry.payload.epoch, list);
  }

  for (const [epoch, entries] of byEpoch) {
    const base = input.baseDecks.get(epoch);
    if (!base) {
      findings.push({ code: 'unknown-epoch', message: `epoch ${epoch} has no starting deck` });
      continue;
    }
    let deck = base.map(elementFromHex);
    for (const entry of entries) {
      const disclosure = input.disclosed.find(
        (candidate) => candidate.seat === entry.payload.seat && candidate.secret.epoch === epoch,
      );
      if (!disclosure) {
        findings.push({
          code: 'layer-not-disclosed',
          message: `seat ${entry.payload.seat} did not disclose its layer for epoch ${epoch}`,
          seq: entry.seq,
          seat: entry.payload.seat,
        });
        continue;
      }
      const commitment = await commitLayer(disclosure.secret);
      if (commitment !== entry.payload.commitment) {
        findings.push({
          code: 'commitment-mismatch',
          message: `seat ${entry.payload.seat} disclosed a layer that does not match what it committed to`,
          seq: entry.seq,
          seat: entry.payload.seat,
        });
        continue;
      }
      const recomputed = shuffleLayer(deck, disclosure.secret.key, disclosure.secret.order);
      const published = entry.payload.deck;
      const matches =
        recomputed.length === published.length &&
        recomputed.every((element, index) => elementToHex(element) === published[index]);
      if (!matches) {
        findings.push({
          code: 'layer-mismatch',
          message: `seat ${entry.payload.seat}'s published deck is not what its disclosed layer produces — the shuffle was not honest`,
          seq: entry.seq,
          seat: entry.payload.seat,
        });
        continue;
      }
      deck = recomputed;
      layersChecked += 1;
    }

    // Deck conservation: unwinding every disclosed layer must give the epoch's
    // cards back, each exactly once. This is the check a substitution fails.
    const codebook = input.codebooks.get(epoch);
    const epochSecrets = input.disclosed
      .filter((candidate) => candidate.secret.epoch === epoch)
      .map((candidate) => candidate.secret);
    if (codebook && epochSecrets.length === entries.length) {
      const opened = new Set<string>();
      for (const element of deck) {
        // Commutative layers come off in any order, so unwinding is just every
        // disclosed key applied once.
        let value = element;
        for (const secret of epochSecrets) value = decryptElement(value, secret.key);
        const card = codebook.cardOf.get(elementToHex(value));
        if (!card) {
          findings.push({
            code: 'deck-not-conserved',
            message: `epoch ${epoch} holds a value that is not a card in its deck`,
          });
          break;
        }
        if (opened.has(card)) {
          findings.push({
            code: 'duplicate-card',
            message: `epoch ${epoch} holds ${card} twice`,
          });
          break;
        }
        opened.add(card);
      }
      for (const opening of input.openings) {
        if (opening.epoch !== epoch) continue;
        openingsChecked += 1;
        if (!opened.has(opening.card)) {
          findings.push({
            code: 'opening-not-in-deck',
            message: `${opening.card} was opened but is not in epoch ${epoch}'s deck`,
          });
        }
      }
    }
  }

  if (byEpoch.size === 0) {
    findings.push({ code: 'no-ceremony', message: 'the transcript holds no shuffle ceremony' });
  }

  return {
    state: findings.length === 0 ? 'verified' : 'disputed',
    findings,
    layersChecked,
    openingsChecked,
  };
}

/** Copy for the room badge. Never says "cheat-proof" and never implies it. */
export function auditSummary(state: VeilAuditState): { label: string; detail: string } {
  switch (state) {
    case 'open':
      return {
        label: 'Open table',
        detail:
          'Fast mode. Every peer replays the full game state, so a modified client could read ' +
          'any hand. Fine among friends; not a competitive guarantee.',
      };
    case 'veiled':
      return {
        label: 'Veiled',
        detail:
          'Hands stayed private: no peer held the deck order or a card it was not dealt. The ' +
          'end-of-match audit has not finished, so nothing is proven yet.',
      };
    case 'verified':
      return {
        label: 'Verified',
        detail:
          'The whole ceremony was recomputed from every seat’s disclosed keys and matched ' +
          'the signed transcript. The deck was conserved and every opening checked out.',
      };
    case 'disputed':
      return {
        label: 'Disputed',
        detail:
          'A check failed: a seat’s disclosed keys do not reproduce what it published, or a ' +
          'card appeared that was not in the deck. This result should not count.',
      };
  }
}

/** Only a fully verified result belongs in a competitive total. */
export function countsAsRanked(state: VeilAuditState): boolean {
  return state === 'verified';
}

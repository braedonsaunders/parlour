import { describe, expect, it } from 'vitest';
import {
  createSession,
  replaySession,
  sessionApply,
  stateHash,
  veilHandleIndex,
} from '@parlour/engine';
import { heartsConfigSchema, type HeartsRules } from './config';
import { heartsGame } from './game';
import type { HeartsState } from './state';

const config: HeartsRules = heartsConfigSchema.resolve({});

const FACE_ORDER = [
  'C1', 'C10', 'C11', 'C12', 'C13', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9',
  'D1', 'D10', 'D11', 'D12', 'D13', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9',
  'H1', 'H10', 'H11', 'H12', 'H13', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9',
  'S1', 'S10', 'S11', 'S12', 'S13', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9',
] as const;

const SUIT_LETTER: Record<string, string> = { clubs: 'C', diamonds: 'D', hearts: 'H', spades: 'S' };

/** A veiled session whose handle→face map the TEST controls. */
function veiledSession(seed = 8_000) {
  const deckOrder = heartsGame.veil
    ? Array.from({ length: 52 }, (_, index) => `v#${index}`)
    : [];
  const faceOf = new Map<string, string>();
  FACE_ORDER.forEach((id, index) => faceOf.set(deckOrder[index]!, id));

  const session = createSession(heartsGame, {
    seed,
    config,
    seats: 4,
    veiled: true,
    deckOrder,
  });
  return { session, faceOf };
}

type Veiled = ReturnType<typeof veiledSession>['session'];

function openMove(
  session: Veiled,
  seat: number,
  moveId: string,
  payload: unknown,
  reveals: readonly (readonly [string, string])[],
) {
  return sessionApply(heartsGame, session, seat, moveId, payload, { reveals: [...reveals] });
}

function runPasses(session: Veiled): Veiled {
  let current = session;
  for (const seat of [0, 1, 2]) {
    const hand = [...(current.state.hands[seat] ?? [])].slice(0, 3);
    current = sessionApply(heartsGame, current, seat!, 'passCards', { cards: hand }).session;
  }
  const hand = [...(current.state.hands[3] ?? [])].slice(0, 3);
  const out = openMove(current, 3, 'passCards', { cards: hand }, []);
  if (out.rejected) throw new Error(out.rejected.code);
  return out.session;
}

/** Chooses a card for `seat`; `cheat` makes the first off-suit throw illegal-but-accepted. */
function driveVeiledHand(
  start: Veiled,
  faceOf: Map<string, string>,
  cheatSeat?: number,
): Veiled {
  let current = runPasses(start);
  let cheated = false;
  let guard = 0;

  while (!current.state.handOver && guard++ < 400) {
    const trick0 = current.state.tricksPlayed === 0 && !current.state.trick;
    // Under Veil every seat may attempt the two-of-clubs lead; only the true
    // holder validates — a knowing driver simply acts as that seat.
    const seat =
      trick0 && !current.state.ledTwoClubs
        ? (current.state.hands.findIndex((cards) =>
            cards.some((h) => faceOf.get(h) === 'C2'),
          ) as number)
        : current.state.turn;
    const hand = [...(current.state.hands[seat] ?? [])];
    const trick = current.state.trick;
    const ledSuit = trick?.ledSuit ?? null;
    const ledLetter = ledSuit ? SUIT_LETTER[ledSuit] : null;
    const leadingTrickOne = trick0;

    // Under Veil the payload speaks REAL ids; the reveal pairs the handle.
    const face = (h: string) => faceOf.get(h)!;
    let handle: string;
    if (leadingTrickOne) {
      handle = hand.find((h) => face(h) === 'C2')!;
    } else if (!ledLetter) {
      const safeLead =
        hand.find((h) => !face(h).startsWith('H') || current.state.heartsBroken) ?? hand[0]!;
      handle = safeLead;
    } else {
      let pool = hand.filter((h) => face(h).startsWith(ledLetter));
      const wantsCheat =
        !cheated && seat === cheatSeat && current.state.tricksPlayed >= 1 && pool.length > 0;
      if (wantsCheat) {
        const target = hand.find((h) => !face(h).startsWith(ledLetter));
        if (target) {
          cheated = true;
          const out = openMove(current, seat, 'playCard', { card: face(target) }, [
            [target, face(target)],
          ]);
          if (out.rejected) throw new Error(`cheat rejected: ${out.rejected.code}`);
          current = out.session;
          continue;
        }
      }
      if (pool.length === 0) pool = hand;
      handle = pool[0]!;
    }

    const out = openMove(current, seat, 'playCard', { card: face(handle) }, [
      [handle, face(handle)],
    ]);
    if (out.rejected) throw new Error(`${seat}/${face(handle)}: ${out.rejected.code}`);
    current = out.session;
  }

  // Veil showdown: every remaining handle opens, then the audit lands.
  for (const seat of [0, 1, 2, 3]) {
    const hand = current.state.hands[seat] ?? [];
    const hidden = hand.filter((h) => h.startsWith('v#'));
    if (hidden.length === 0 && current.state.openedUp[seat]) continue;
    const reveals = (hidden.length > 0 ? hidden : hand).map(
      (h) => [h, faceOf.get(h)!] as const,
    );
    const out = openMove(current, seat, 'showdown.open', undefined, reveals);
    if (out.rejected) throw new Error(`showdown ${seat}: ${out.rejected.code}`);
    current = out.session;
  }
  return current;
}

describe('hearts under Veil', () => {
  it('deals opaque handles with no public setup cards', () => {
    const { session } = veiledSession();
    expect(session.state.veiled).toBe(true);
    expect(session.veiled).toBe(true);
    expect(session.phase.phase).toBe('pass');
    for (const hand of session.state.hands) {
      expect(hand).toHaveLength(13);
      expect(hand.every((card) => card.startsWith('v#'))).toBe(true);
    }
    expect(veilHandleIndex(session.state.hands[0]![0])).toBeTypeOf('number');
  });

  it('passes handles behind the wall and reveals only at the drop', () => {
    const { session } = veiledSession(8_010);
    const afterPass = runPasses(session);
    expect(afterPass.state.passing).toBe(false);
    for (const hand of afterPass.state.hands) {
      expect(hand).toHaveLength(13);
      expect(hand.every((card) => card.startsWith('v#'))).toBe(true);
    }
  });

  it('rejects wrong leads on trick one without logging them', () => {
    const { session, faceOf } = veiledSession(8_020);
    let current = runPasses(session);

    for (const seat of [0, 1, 2, 3]) {
      const impostor = (current.state.hands[seat] ?? []).find(
        (h) => faceOf.get(h) !== 'C2',
      );
      if (!impostor) continue;
      const outcome = openMove(current, seat, 'playCard', { card: faceOf.get(impostor) }, [
        [impostor, faceOf.get(impostor)!],
      ]);
      expect(outcome.rejected?.code).toBe('lead-two-clubs');
      expect(outcome.events).toEqual([]);
    }

    // the true holder leads; the opened card is public from then on
    let led = false;
    for (const seat of [0, 1, 2, 3]) {
      if (led) break;
      for (const h of current.state.hands[seat] ?? []) {
        if (faceOf.get(h) !== 'C2') continue;
        const outcome = openMove(current, seat, 'playCard', { card: 'C2' }, [[h, 'C2']]);
        expect(outcome.rejected).toBeUndefined();
        expect(outcome.fx.some((event) => event.kind === 'tricks.play')).toBe(true);
        led = true;
        break;
      }
    }
    expect(led).toBe(true);
  });

  it('audits honor-based follow suit at the showdown', () => {
    const clean = driveVeiledHand(veiledSession(8_030).session, veiledSession(8_030).faceOf);
    expect(clean.status).toBe('ended');
    expect(clean.state.disputed).toEqual([]);
  });

  it('marks a seat disputed when it broke follow suit under the veil', () => {
    const a = veiledSession(8_040);
    const finished = driveVeiledHand(a.session, a.faceOf, 1);
    expect(finished.status).toBe('ended');
    expect(finished.state.disputed).toContain(1);
    // the dispute rides into the result details
    const seatOne = finished.result?.rankings.find((rank) => rank.seat === 1);
    expect(seatOne?.detail?.disputed).toBe(true);
  });

  it('replays a veiled log bit-for-bit', () => {
    const { session } = veiledSession(8_050);
    const passed = runPasses(session);
    const replayed = replaySession<HeartsState, HeartsRules>(heartsGame, 8_050, [...passed.log], {
      config,
      seats: 4,
      veiled: true,
      deckOrder: Array.from({ length: 52 }, (_, index) => `v#${index}`),
    });
    expect(stateHash(replayed.state)).toBe(stateHash(passed.state));
  });
});

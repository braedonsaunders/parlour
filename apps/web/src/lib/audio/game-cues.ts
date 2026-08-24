import type { FxEvent } from '@parlour/engine';
import type { SoundCue } from './cues';

export function klondikeCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'klondike.stock-draw':
        return [{ id: 'klondike.draw', atMs }];
      case 'klondike.stock-recycle':
        return [{ id: 'klondike.recycle', atMs }];
      case 'klondike.cards-move':
        return [{ id: 'klondike.move', atMs }];
      case 'klondike.tableau-flip':
        return [{ id: 'klondike.flip', atMs }];
      case 'klondike.foundation-build':
        return [{ id: 'klondike.foundation', atMs }];
      case 'klondike.win':
        return [{ id: 'klondike.win', atMs }];
      default:
        return [];
    }
  });
}

export function heartsCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  const hasSharedTrickCollect = fx.some((event) => event.kind === 'tricks.collect');

  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'hearts.pass.reveal':
        return [{ id: 'hearts.pass-commit', atMs }];
      case 'tricks.collect':
        return [{ id: 'hearts.trick-sweep', atMs }];
      case 'hearts.trick.won':
        return hasSharedTrickCollect ? [] : [{ id: 'hearts.trick-sweep', atMs }];
      case 'hearts.point':
        return [{ id: 'hearts.point-heart', atMs }];
      case 'hearts.queen':
        return [{ id: 'hearts.queen-drop', atMs }];
      case 'hearts.broken':
        return [{ id: 'hearts.hearts-broken', atMs }];
      case 'hearts.moon':
        return [{ id: 'hearts.moon-shoot', atMs }];
      default:
        return [];
    }
  });
}

export function euchreCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'euchre.call':
        if (payloadBoolean(event, 'alone')) return [{ id: 'euchre.alone', atMs }];
        return [
          {
            id: payloadNumber(event, 'round') === 1 ? 'euchre.order-up' : 'euchre.trump-called',
            atMs,
          },
        ];
      case 'euchre.bid-pass':
        return [{ id: 'euchre.pass', atMs }];
      case 'euchre.pickup':
        return [{ id: 'euchre.dealer-pickup', atMs }];
      case 'euchre.trick-collect':
        return [{ id: 'euchre.trick-collect', atMs: atMs + 120 }];
      case 'euchre.hand-score': {
        const reason = payloadString(event, 'reason');
        if (reason === 'euchred') return [{ id: 'euchre.euchre-sting', atMs }];
        if (reason === 'march' || reason === 'march-alone') {
          return [{ id: 'euchre.march-fanfare', atMs }];
        }
        return [];
      }
      case 'euchre.score-chip':
        return [{ id: 'euchre.score-chime', atMs }];
      default:
        return [];
    }
  });
}

/**
 * Poker's table sounds. Chips do the talking: a bet and a raise are the same
 * chip stack at different weights, the pot slides once per hand, and a bust
 * gets its own sting so a seat never vanishes silently.
 */
export function pokerCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'poker.blind':
      case 'poker.ante':
        return [{ id: 'poker.chips-soft', atMs }];
      case 'poker.action': {
        const kind = payloadRecord(event)?.kind;
        if (kind === 'fold') return [{ id: 'poker.fold', atMs }];
        if (kind === 'check') return [{ id: 'poker.check', atMs }];
        if (kind === 'call') return [{ id: 'poker.chips-soft', atMs }];
        return [{ id: 'poker.chips-hard', atMs }];
      }
      case 'poker.street':
        return [{ id: 'poker.board', atMs }];
      case 'poker.pot-collect':
        return [{ id: 'poker.pot', atMs }];
      case 'poker.award':
        return [{ id: 'poker.award', atMs }];
      case 'poker.bust':
        return [{ id: 'poker.bust', atMs }];
      case 'poker.blinds-up':
        return [{ id: 'poker.blinds-up', atMs }];
      default:
        return [];
    }
  });
}

export function spadesCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'spades.bid':
        return [{ id: payloadBoolean(event, 'nil') ? 'spades.bid-nil' : 'spades.bid', atMs }];
      case 'spades.bids-complete':
        return [{ id: 'spades.bids-complete', atMs }];
      case 'spades.spades-broken':
        return [{ id: 'spades.spades-broken', atMs }];
      case 'spades.trick-collect':
        return [{ id: 'spades.trick-collect', atMs: atMs + 120 }];
      case 'spades.nil-made':
        return [{ id: 'spades.nil-made', atMs }];
      case 'spades.nil-failed':
        return [{ id: 'spades.nil-failed', atMs }];
      case 'spades.hand-score': {
        // One event carries both partnerships; a set anywhere stings, and an
        // unblemished made contract gets the fanfare.
        const teams = payloadRecord(event)?.teams;
        if (!Array.isArray(teams)) return [];
        const made = teams.filter((team) => (team as { made?: unknown }).made === true);
        if (made.length < teams.length) return [{ id: 'spades.set', atMs }];
        return made.length > 0 ? [{ id: 'spades.contract-made', atMs }] : [];
      }
      case 'spades.bag-penalty':
        return [{ id: 'spades.bag-penalty', atMs }];
      case 'spades.score-chip':
        return [{ id: 'spades.score-chime', atMs }];
      default:
        return [];
    }
  });
}

export function ginCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'burst.knock':
        return [{ id: 'gin.knock', atMs }];
      case 'gin.gin':
        return [{ id: 'gin.gin', atMs }];
      case 'gin.big-gin':
        return [{ id: 'gin.big-gin', atMs }];
      case 'gin.undercut':
        return [{ id: 'gin.undercut', atMs: atMs + 120 }];
      default:
        return [];
    }
  });
}

export function cribbageCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'cribbage.peg':
        return [{ id: 'cribbage.peg-move', atMs }];
      case 'cribbage.score': {
        const reason = payloadString(event, 'reason');
        if (reason === 'run') return [{ id: 'cribbage.score-run', atMs }];
        if (reason === 'fifteen') return [{ id: 'cribbage.score-fifteen', atMs }];
        if (reason === 'pair' || reason === 'trip' || reason === 'quad') {
          const rate = reason === 'quad' ? 0.9 : reason === 'trip' ? 0.96 : 1.02;
          return [{ id: 'cribbage.score-pair', atMs, rate }];
        }
        return [];
      }
      case 'cribbage.thirtyone':
        return [{ id: 'cribbage.thirtyone', atMs }];
      case 'cribbage.go':
        return [{ id: 'cribbage.go-knock', atMs }];
      case 'cribbage.heels':
        return [{ id: 'cribbage.heels', atMs }];
      case 'cribbage.crib.deal':
        return [{ id: 'cribbage.crib-slide', atMs }];
      case 'showdown.reveal':
        return [{ id: 'cribbage.show-reveal', atMs }];
      case 'cribbage.skunk':
        return [{ id: 'cribbage.skunk', atMs }];
      default:
        return [];
    }
  });
}

export function ratscrewCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'ratscrew.slap':
        return [{ id: 'ratscrew.slap-win', atMs }];
      case 'ratscrew.misslap':
        return [{ id: 'ratscrew.mislap', atMs }];
      case 'ratscrew.slap-window':
        return [{ id: 'ratscrew.window-open', atMs }];
      case 'ratscrew.challenge':
        return [{ id: 'ratscrew.challenge', atMs: atMs + 120 }];
      case 'ratscrew.pile-win':
        return [{ id: 'ratscrew.scoop', atMs }];
      case 'ratscrew.burn':
        return [{ id: 'ratscrew.burn', atMs }];
      case 'ratscrew.comeback':
        return [{ id: 'ratscrew.comeback', atMs }];
      default:
        return [];
    }
  });
}

export function presidentCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'president.set':
        return [{ id: 'president.set-slam', atMs: atMs + 150 }];
      case 'president.pass':
        return [{ id: 'president.pass', atMs }];
      case 'president.pile-clear':
        return [{ id: 'president.pile-clear', atMs: atMs + 60 }];
      case 'president.role': {
        const role = payloadString(event, 'role');
        if (role === 'president') return [{ id: 'president.crown', atMs }];
        if (role === 'scum') return [{ id: 'president.scum', atMs }];
        if (role === 'vice' || role === 'vice-scum') {
          return [{ id: 'president.role-chime', atMs }];
        }
        return [];
      }
      case 'president.exchange':
        return [{ id: 'president.exchange-swish', atMs }];
      default:
        return [];
    }
  });
}

export function eightsCuesForFx(fx: readonly FxEvent[]): SoundCue[] {
  return fx.flatMap((event) => {
    const atMs = Math.max(0, event.at ?? 0);
    switch (event.kind) {
      case 'eights.wild':
        return [{ id: 'eights.wild', atMs }];
      case 'eights.suit':
        return [{ id: 'eights.suit', atMs }];
      case 'eights.skip':
        return [{ id: 'eights.skip', atMs }];
      case 'eights.reverse':
        return [{ id: 'eights.reverse', atMs }];
      case 'eights.draw-stack':
        return [{ id: 'eights.draw-stack', atMs }];
      case 'eights.out':
        return [{ id: 'eights.out', atMs }];
      case 'eights.blocked':
        return [{ id: 'eights.blocked', atMs }];
      case 'eights.score':
        return [{ id: 'eights.score', atMs: atMs + 200 }];
      default:
        return [];
    }
  });
}

function payloadString(event: FxEvent, field: string): string | null {
  const value = payloadRecord(event)?.[field];
  return typeof value === 'string' ? value : null;
}

function payloadNumber(event: FxEvent, field: string): number | null {
  const value = payloadRecord(event)?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadBoolean(event: FxEvent, field: string): boolean | null {
  const value = payloadRecord(event)?.[field];
  return typeof value === 'boolean' ? value : null;
}

function payloadRecord(event: FxEvent): Record<string, unknown> | null {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return null;
  }
  return event.payload as Record<string, unknown>;
}

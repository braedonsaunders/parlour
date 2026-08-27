import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { soundCuesForFx } from './sfx';

describe('fx-driven table audio', () => {
  it('sounds every dealt card and gives a discard a spatial flight then landing', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.DealCard, payload: {}, at: 0 },
          { kind: Fx.DealCard, payload: {}, at: 80 },
          { kind: Fx.DiscardCard, payload: {}, at: 200 },
        ],
        'blitz',
      ),
    ).toEqual([
      { id: 'parlour.deal.card', atMs: 0, rate: 0.97 },
      { id: 'parlour.deal.card', atMs: 80, rate: 1.02 },
      { id: 'parlour.card.discard.flight', atMs: 200 },
      { id: 'parlour.card.land', atMs: 380, rate: 0.99 },
    ]);
  });

  it('distinguishes stock and discard pickups from flips and shuffles', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.DrawCard, payload: { from: 'stock' }, at: 0 },
          { kind: Fx.DrawCard, payload: { from: 'discard' }, at: 100 },
          { kind: Fx.FlipCard, payload: {}, at: 200 },
          { kind: Fx.ShuffleStock, payload: {}, at: 300 },
          { kind: Fx.TurnRing, payload: {}, at: 400 },
        ],
        'blitz',
      ),
    ).toEqual([
      { id: 'parlour.card.draw.stock', atMs: 0, rate: 0.97 },
      { id: 'parlour.card.draw.discard', atMs: 100, rate: 1.02 },
      { id: 'parlour.card.flip', atMs: 200 },
      { id: 'parlour.stock.shuffle', atMs: 300 },
      { id: 'parlour.turn.ready', atMs: 400 },
    ]);
  });

  it('layers Wild Pile action-card Foley with human callouts', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.reverse', payload: {}, at: 20 },
          { kind: 'wildpile.skip', payload: {}, at: 30 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.reverse', atMs: 140 },
      { id: 'wildpile.voice.reverse', atMs: 320 },
      { id: 'wildpile.skip', atMs: 150 },
      { id: 'wildpile.voice.skip', atMs: 330 },
    ]);
  });

  it('distinguishes draw-two, stacked, and wild-draw-four announcements', () => {
    expect(
      soundCuesForFx([{ kind: 'wildpile.draw-stack', payload: { amount: 2 }, at: 0 }], 'wildpile'),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.draw-two', atMs: 320 },
    ]);

    expect(
      soundCuesForFx([{ kind: 'wildpile.draw-stack', payload: { amount: 6 }, at: 0 }], 'wildpile'),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.stacked', atMs: 320 },
    ]);

    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.draw-stack', payload: { amount: 4 }, at: 0 },
          { kind: 'wildpile.wild', payload: {}, at: 0 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.draw-stack', atMs: 120 },
      { id: 'wildpile.voice.draw-four', atMs: 320 },
      { id: 'wildpile.wild.surge', atMs: 120 },
    ]);
  });

  it('announces wild color switches and the last-card moment', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'wildpile.wild', payload: {}, at: 0 },
          { kind: 'wildpile.color', payload: { color: 'blue' }, at: 500 },
          { kind: 'wildpile.last-card', payload: { seat: 0 }, at: 0 },
        ],
        'wildpile',
      ),
    ).toEqual([
      { id: 'wildpile.wild.surge', atMs: 120 },
      { id: 'wildpile.voice.wild', atMs: 320 },
      { id: 'wildpile.color', atMs: 500 },
      { id: 'wildpile.voice.blue', atMs: 600 },
      { id: 'wildpile.voice.last-card', atMs: 950 },
    ]);
  });

  it('sounds the missed last-card penalty at the engine-authored moment', () => {
    expect(
      soundCuesForFx(
        [{ kind: 'wildpile.caught', payload: { seat: 0, amount: 2 }, at: 240 }],
        'wildpile',
      ),
    ).toEqual([{ id: 'wildpile.caught', atMs: 240 }]);
  });

  it('authors Hearts pass, penalty, trick, broken-heart, and moon moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'hearts.pass.reveal', payload: {}, at: 0 },
          { kind: 'tricks.collect', payload: {}, at: 100 },
          { kind: 'hearts.trick.won', payload: {}, at: 100 },
          { kind: 'hearts.point', payload: {}, at: 200 },
          { kind: 'hearts.queen', payload: {}, at: 300 },
          { kind: 'hearts.broken', payload: {}, at: 400 },
          { kind: 'hearts.moon', payload: {}, at: 500 },
        ],
        'hearts',
      ),
    ).toEqual([
      { id: 'hearts.pass-commit', atMs: 0 },
      { id: 'hearts.trick-sweep', atMs: 100 },
      { id: 'hearts.point-heart', atMs: 200 },
      { id: 'hearts.queen-drop', atMs: 300 },
      { id: 'hearts.hearts-broken', atMs: 400 },
      { id: 'hearts.moon-shoot', atMs: 500 },
    ]);
    expect(soundCuesForFx([{ kind: 'hearts.trick.won', payload: {}, at: 25 }], 'hearts')).toEqual([
      { id: 'hearts.trick-sweep', atMs: 25 },
    ]);
  });

  it('branches Euchre calls and hand scores from their authored payloads', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'euchre.call', payload: { round: 1, alone: false }, at: 0 },
          { kind: 'euchre.call', payload: { round: 2, alone: false }, at: 10 },
          { kind: 'euchre.call', payload: { round: 1, alone: true }, at: 20 },
          { kind: 'euchre.bid-pass', payload: {}, at: 30 },
          { kind: 'euchre.pickup', payload: {}, at: 40 },
          { kind: 'euchre.trick-collect', payload: {}, at: 50 },
          { kind: 'euchre.hand-score', payload: { reason: 'euchred' }, at: 60 },
          { kind: 'euchre.hand-score', payload: { reason: 'march-alone' }, at: 70 },
          { kind: 'euchre.score-chip', payload: {}, at: 80 },
        ],
        'euchre',
      ),
    ).toEqual([
      { id: 'euchre.order-up', atMs: 0 },
      { id: 'euchre.trump-called', atMs: 10 },
      { id: 'euchre.alone', atMs: 20 },
      { id: 'euchre.pass', atMs: 30 },
      { id: 'euchre.dealer-pickup', atMs: 40 },
      { id: 'euchre.trick-collect', atMs: 170 },
      { id: 'euchre.euchre-sting', atMs: 60 },
      { id: 'euchre.march-fanfare', atMs: 70 },
      { id: 'euchre.score-chime', atMs: 80 },
    ]);
  });

  it('keeps Gin knock, gin, big-gin, and undercut accents game-specific', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'burst.knock', payload: {}, at: 0 },
          { kind: 'gin.gin', payload: {}, at: 100 },
          { kind: 'gin.big-gin', payload: {}, at: 200 },
          { kind: 'gin.undercut', payload: {}, at: 300 },
        ],
        'gin',
      ),
    ).toEqual([
      { id: 'gin.knock', atMs: 0 },
      { id: 'gin.gin', atMs: 100 },
      { id: 'gin.big-gin', atMs: 200 },
      { id: 'gin.undercut', atMs: 420 },
    ]);
  });

  it('maps Cribbage score reasons and weights larger sets with playback rate', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'cribbage.peg', payload: {}, at: 0 },
          { kind: 'cribbage.score', payload: { reason: 'run' }, at: 10 },
          { kind: 'cribbage.score', payload: { reason: 'fifteen' }, at: 20 },
          { kind: 'cribbage.score', payload: { reason: 'pair' }, at: 30 },
          { kind: 'cribbage.score', payload: { reason: 'trip' }, at: 40 },
          { kind: 'cribbage.score', payload: { reason: 'quad' }, at: 50 },
          { kind: 'cribbage.thirtyone', payload: {}, at: 60 },
          { kind: 'cribbage.go', payload: {}, at: 70 },
          { kind: 'cribbage.heels', payload: {}, at: 80 },
          { kind: 'cribbage.crib.deal', payload: {}, at: 90 },
          { kind: 'showdown.reveal', payload: {}, at: 100 },
          { kind: 'cribbage.skunk', payload: {}, at: 110 },
        ],
        'cribbage',
      ),
    ).toEqual([
      { id: 'cribbage.peg-move', atMs: 0 },
      { id: 'cribbage.score-run', atMs: 10 },
      { id: 'cribbage.score-fifteen', atMs: 20 },
      { id: 'cribbage.score-pair', atMs: 30, rate: 1.02 },
      { id: 'cribbage.score-pair', atMs: 40, rate: 0.96 },
      { id: 'cribbage.score-pair', atMs: 50, rate: 0.9 },
      { id: 'cribbage.thirtyone', atMs: 60 },
      { id: 'cribbage.go-knock', atMs: 70 },
      { id: 'cribbage.heels', atMs: 80 },
      { id: 'cribbage.crib-slide', atMs: 90 },
      { id: 'cribbage.show-reveal', atMs: 100 },
      { id: 'cribbage.skunk', atMs: 110 },
    ]);
  });

  it('maps every Ratscrew real-time accent from authority fx timing', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'ratscrew.slap', payload: {}, at: 0 },
          { kind: 'ratscrew.misslap', payload: {}, at: 10 },
          { kind: 'ratscrew.slap-window', payload: {}, at: 20 },
          { kind: 'ratscrew.challenge', payload: {}, at: 30 },
          { kind: 'ratscrew.pile-win', payload: {}, at: 40 },
          { kind: 'ratscrew.burn', payload: {}, at: 50 },
          { kind: 'ratscrew.comeback', payload: {}, at: 60 },
        ],
        'ratscrew',
      ),
    ).toEqual([
      { id: 'ratscrew.slap-win', atMs: 0 },
      { id: 'ratscrew.mislap', atMs: 10 },
      { id: 'ratscrew.window-open', atMs: 20 },
      { id: 'ratscrew.challenge', atMs: 150 },
      { id: 'ratscrew.scoop', atMs: 40 },
      { id: 'ratscrew.burn', atMs: 50 },
      { id: 'ratscrew.comeback', atMs: 60 },
    ]);
  });

  it('layers President set, pile, role, and exchange accents over shared cards', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'president.set', payload: {}, at: 0 },
          { kind: 'president.pass', payload: {}, at: 10 },
          { kind: 'president.pile-clear', payload: {}, at: 20 },
          { kind: 'president.role', payload: { role: 'president' }, at: 30 },
          { kind: 'president.role', payload: { role: 'scum' }, at: 40 },
          { kind: 'president.role', payload: { role: 'vice-scum' }, at: 50 },
          { kind: 'president.exchange', payload: {}, at: 60 },
        ],
        'president',
      ),
    ).toEqual([
      { id: 'president.set-slam', atMs: 150 },
      { id: 'president.pass', atMs: 10 },
      { id: 'president.pile-clear', atMs: 80 },
      { id: 'president.crown', atMs: 30 },
      { id: 'president.scum', atMs: 40 },
      { id: 'president.role-chime', atMs: 50 },
      { id: 'president.exchange-swish', atMs: 60 },
    ]);
  });

  it('maps Golf draw, move, hole-out, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'golf.stock-draw', payload: {}, at: 0 },
          { kind: 'golf.cards-move', payload: {}, at: 20 },
          { kind: 'golf.hole-out', payload: {}, at: 40 },
          { kind: 'golf.win', payload: {}, at: 60 },
        ],
        'golf',
      ),
    ).toEqual([
      { id: 'golf.draw', atMs: 0 },
      { id: 'golf.move', atMs: 20 },
      { id: 'golf.hole-out', atMs: 40 },
      { id: 'golf.win', atMs: 60 },
    ]);
  });

  it('maps Klondike draw, move, flip, foundation, recycle, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'klondike.stock-draw', payload: {}, at: 0 },
          { kind: 'klondike.cards-move', payload: {}, at: 20 },
          { kind: 'klondike.tableau-flip', payload: {}, at: 40 },
          { kind: 'klondike.foundation-build', payload: {}, at: 60 },
          { kind: 'klondike.stock-recycle', payload: {}, at: 80 },
          { kind: 'klondike.win', payload: {}, at: 100 },
        ],
        'klondike',
      ),
    ).toEqual([
      { id: 'klondike.draw', atMs: 0 },
      { id: 'klondike.move', atMs: 20 },
      { id: 'klondike.flip', atMs: 40 },
      { id: 'klondike.foundation', atMs: 60 },
      { id: 'klondike.recycle', atMs: 80 },
      { id: 'klondike.win', atMs: 100 },
    ]);
  });

  it('maps FreeCell park, move, foundation, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'freecell.cards-move', payload: { to: 'cell:0' }, at: 0 },
          { kind: 'freecell.cards-move', payload: { to: 'tableau:2' }, at: 20 },
          { kind: 'freecell.foundation-build', payload: {}, at: 40 },
          { kind: 'freecell.win', payload: {}, at: 60 },
        ],
        'freecell',
      ),
    ).toEqual([
      { id: 'freecell.park', atMs: 0 },
      { id: 'freecell.move', atMs: 20 },
      { id: 'freecell.foundation', atMs: 40 },
      { id: 'freecell.win', atMs: 60 },
    ]);
  });

  it('maps Spider deal, move, flip, suit-clear, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'spider.stock-deal', payload: {}, at: 0 },
          { kind: 'spider.cards-move', payload: {}, at: 20 },
          { kind: 'spider.tableau-flip', payload: {}, at: 40 },
          { kind: 'spider.suit-clear', payload: {}, at: 60 },
          { kind: 'spider.win', payload: {}, at: 80 },
        ],
        'spider',
      ),
    ).toEqual([
      { id: 'spider.deal', atMs: 0 },
      { id: 'spider.move', atMs: 20 },
      { id: 'spider.flip', atMs: 40 },
      { id: 'spider.suit-clear', atMs: 60 },
      { id: 'spider.win', atMs: 80 },
    ]);
  });

  it('maps Pyramid draw, pair, king, hole-out, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'pyramid.stock-draw', payload: {}, at: 0 },
          { kind: 'pyramid.pair', payload: {}, at: 20 },
          { kind: 'pyramid.remove', payload: {}, at: 40 },
          { kind: 'pyramid.hole-out', payload: {}, at: 60 },
          { kind: 'pyramid.win', payload: {}, at: 80 },
        ],
        'pyramid',
      ),
    ).toEqual([
      { id: 'pyramid.draw', atMs: 0 },
      { id: 'pyramid.pair', atMs: 20 },
      { id: 'pyramid.king', atMs: 40 },
      { id: 'pyramid.hole-out', atMs: 60 },
      { id: 'pyramid.win', atMs: 80 },
    ]);
  });

  it('maps Durak beat, pickup, and transfer moments, and leaves the rest to shared card Foley', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'durak.beat', payload: { seat: 1, attack: 'S10', card: 'H6' }, at: 0 },
          { kind: 'durak.pickup', payload: { seat: 1, cards: 3 }, at: 20 },
          { kind: 'durak.transfer', payload: { seat: 0, card: 'H10', to: 1 }, at: 40 },
          { kind: 'durak.attack', payload: { seat: 0, card: 'S10' }, at: 60 },
          { kind: 'durak.out', payload: { seat: 0 }, at: 80 },
        ],
        'durak',
      ),
    ).toEqual([
      { id: 'durak.beat', atMs: 0 },
      { id: 'durak.pickup', atMs: 20 },
      { id: 'durak.transfer', atMs: 40 },
    ]);
  });

  it('maps Palace burn, flip-down, pickup, and out moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'palace.burn', payload: {}, at: 0 },
          { kind: 'palace.flipDown', payload: {}, at: 20 },
          { kind: 'palace.pickup', payload: {}, at: 40 },
          { kind: 'palace.out', payload: {}, at: 80 },
        ],
        'palace',
      ),
    ).toEqual([
      { id: 'palace.burn', atMs: 0 },
      { id: 'palace.flip-down', atMs: 20 },
      { id: 'palace.pickup', atMs: 100 },
      { id: 'palace.out', atMs: 80 },
    ]);
  });

  it('maps pinochle bid, meld, and set moments to their own generated stings', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'pinochle.bid', payload: { seat: 0, bid: 20 }, at: 0 },
          { kind: 'pinochle.bid', payload: { seat: 1, bid: null }, at: 10 },
          { kind: 'pinochle.trump', payload: { seat: 0, team: 0, suit: 'S' }, at: 20 },
          { kind: 'pinochle.meld', payload: { seat: 0, team: 0, breakdown: {} }, at: 30 },
          { kind: 'pinochle.trick-collect', payload: {}, at: 40 },
          { kind: 'pinochle.hand-score', payload: { set: false }, at: 50 },
          { kind: 'pinochle.hand-score', payload: { set: true }, at: 60 },
          { kind: 'pinochle.set', payload: { team: 0, bid: 20 }, at: 70 },
          { kind: 'pinochle.score-chip', payload: {}, at: 80 },
        ],
        'pinochle',
      ),
    ).toEqual([
      { id: 'pinochle.bid', atMs: 0 },
      { id: 'pinochle.pass', atMs: 10 },
      { id: 'pinochle.trump', atMs: 20 },
      { id: 'pinochle.meld', atMs: 30 },
      { id: 'pinochle.trick-collect', atMs: 40 },
      { id: 'pinochle.contract-made', atMs: 50 },
      { id: 'pinochle.set', atMs: 70 },
      { id: 'pinochle.score-chime', atMs: 80 },
    ]);
  });

  it('maps TriPeaks flip, play, recycle, hole-out, and win moments', () => {
    expect(
      soundCuesForFx(
        [
          { kind: 'tripeaks.stock-flip', payload: {}, at: 0 },
          { kind: 'tripeaks.play', payload: {}, at: 20 },
          { kind: 'tripeaks.stock-recycle', payload: {}, at: 40 },
          { kind: 'tripeaks.hole-out', payload: {}, at: 60 },
          { kind: 'tripeaks.win', payload: {}, at: 80 },
        ],
        'tripeaks',
      ),
    ).toEqual([
      { id: 'tripeaks.flip', atMs: 0 },
      { id: 'tripeaks.move', atMs: 20 },
      { id: 'tripeaks.recycle', atMs: 40 },
      { id: 'tripeaks.hole-out', atMs: 60 },
      { id: 'tripeaks.win', atMs: 80 },
    ]);
  });

  it('plays the Blitz knock immediately and leaves later celebration sounds choreographed', () => {
    expect(
      soundCuesForFx(
        [
          { kind: Fx.Knock, payload: { seat: 0 } },
          { kind: Fx.Blitz, payload: { seat: 0 } },
          { kind: Fx.ChipLoss, payload: { seat: 1 } },
        ],
        'blitz',
      ),
    ).toEqual([{ id: 'blitz.knock', atMs: 0 }]);
  });
});

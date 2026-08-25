import { describe, expect, it, vi } from 'vitest';
import { cancelWaapiAnimations, isCardFlightCue, playCardFlight } from '@/lib/table/waapi-flight';
import { flightPoint, zonePoint } from './fx-animation';

function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return this;
    },
  };
}

describe('zonePoint', () => {
  it('aims at the card face inside a pile, not the narrower zone box', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => fakeRect(0, 0, 1000, 1000),
    });
    const zone = document.createElement('button');
    zone.dataset.zone = 'stock';
    zone.setAttribute('aria-label', 'Draw from stock, 80 cards remain');
    Object.defineProperty(zone, 'getBoundingClientRect', {
      value: () => fakeRect(400, 300, 88, 125),
    });
    const face = document.createElement('span');
    face.dataset.zoneFace = '';
    Object.defineProperty(face, 'getBoundingClientRect', {
      value: () => fakeRect(400, 300, 115, 161),
    });
    zone.append(face);
    root.append(zone);

    expect(zonePoint('stock', root, root.getBoundingClientRect())).toEqual({
      x: 457.5,
      y: 380.5,
    });
  });

  it('does not snap a hand zone to the leftmost card', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => fakeRect(0, 0, 1000, 1000),
    });
    const rail = document.createElement('div');
    rail.dataset.zone = 'hand:0';
    Object.defineProperty(rail, 'getBoundingClientRect', {
      value: () => fakeRect(200, 700, 400, 120),
    });
    const left = document.createElement('span');
    left.className = 'card';
    Object.defineProperty(left, 'getBoundingClientRect', {
      value: () => fakeRect(220, 720, 80, 112),
    });
    rail.append(left);
    root.append(rail);

    expect(zonePoint('hand:0', root, root.getBoundingClientRect())).toEqual({
      x: 400,
      y: 760,
    });
  });
});

describe('flightPoint', () => {
  it('aims a discard at the chosen hand card, not the rail', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => fakeRect(0, 0, 1000, 1000),
    });
    const rail = document.createElement('div');
    rail.dataset.zone = 'hand:0';
    Object.defineProperty(rail, 'getBoundingClientRect', {
      value: () => fakeRect(200, 700, 400, 120),
    });
    const left = document.createElement('div');
    left.dataset.handCard = '';
    left.dataset.cardId = 'H1';
    Object.defineProperty(left, 'getBoundingClientRect', {
      value: () => fakeRect(220, 720, 80, 112),
    });
    const chosen = document.createElement('div');
    chosen.dataset.handCard = '';
    chosen.dataset.cardId = 'C4';
    chosen.dataset.flightTarget = 'C4';
    const fan = document.createElement('div');
    fan.dataset.handFan = '';
    Object.defineProperty(fan, 'getBoundingClientRect', {
      value: () => fakeRect(520, 710, 80, 112),
    });
    chosen.append(fan);
    rail.append(left, chosen);
    root.append(rail);

    expect(flightPoint('hand:0', root, root.getBoundingClientRect(), 'C4')).toMatchObject({
      x: 560,
      y: 766,
    });
  });

  it('does not launch an opponent discard from the local fan', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'getBoundingClientRect', {
      value: () => fakeRect(0, 0, 1000, 1000),
    });
    const local = document.createElement('div');
    local.dataset.zone = 'hand:0';
    Object.defineProperty(local, 'getBoundingClientRect', {
      value: () => fakeRect(200, 700, 400, 120),
    });
    const chosen = document.createElement('div');
    chosen.dataset.flightTarget = 'C4';
    const fan = document.createElement('div');
    fan.dataset.handFan = '';
    Object.defineProperty(fan, 'getBoundingClientRect', {
      value: () => fakeRect(520, 710, 80, 112),
    });
    chosen.append(fan);
    local.append(chosen);
    const opponent = document.createElement('div');
    opponent.dataset.seat = '1';
    Object.defineProperty(opponent, 'getBoundingClientRect', {
      value: () => fakeRect(40, 300, 80, 200),
    });
    root.append(local, opponent);

    expect(flightPoint('hand:1', root, root.getBoundingClientRect(), 'C4')).toEqual({
      x: 80,
      y: 400,
    });
  });
});

describe('useFxAnimation flight driver', () => {
  it('treats deal/flip/draw/discard/trick-play/transfer/layoff as compositor flights', () => {
    expect(isCardFlightCue({ type: 'draw' } as never)).toBe(true);
    expect(isCardFlightCue({ type: 'knock' } as never)).toBe(false);
  });

  it('plays a measured flight through WAAPI and cancels it cleanly', () => {
    const cancel = vi.fn();
    const flyer = document.createElement('div');
    flyer.dataset.fxCue = '0:card.deal';
    const card = document.createElement('span');
    card.dataset.flightCard = '';
    const trail = document.createElement('i');
    trail.className = 'cardTrail';
    const glint = document.createElement('i');
    glint.className = 'cardGlint';
    flyer.append(trail, card, glint);
    for (const node of [flyer, card, trail, glint]) {
      node.animate = (() => ({ cancel })) as unknown as typeof node.animate;
    }

    const from = zonePoint('stock', flyer, fakeRect(0, 0, 1000, 1000));
    const animations = playCardFlight(
      { element: flyer, card, trail, glint },
      {
        startMs: 0,
        flightDuration: 0.22,
        settleDuration: 0.08,
        fromX: from.x,
        fromY: from.y,
        toX: 500,
        toY: 820,
        arcPeak: 200,
        takeoffRotate: -7,
        landingRotation: 2,
        landingScale: 1,
        handoff: false,
        flip: false,
      },
    );
    expect(animations.length).toBeGreaterThan(0);
    cancelWaapiAnimations(animations);
    expect(cancel).toHaveBeenCalledTimes(animations.length);
    expect(flyer.getAttribute('style')).toBeNull();
  });
});

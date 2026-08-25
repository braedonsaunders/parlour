import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyles = (name: string) =>
  readFileSync(join(process.cwd(), `src/styles/${name}.module.css`), 'utf8');

const table = readStyles('table');
const euchre = readStyles('euchre');
const gin = readStyles('gin');
const hearts = readStyles('hearts');
const president = readStyles('president');
const wild = readStyles('wild');
const wipe = readStyles('wipe');
const splash = readStyles('splash');

function declarationsFor(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

function zIndexFor(source: string, selector: string): number {
  const match = declarationsFor(source, selector).match(/z-index:\s*(-?\d+)\s*;/);
  expect(match, `${selector} declares a numeric z-index`).not.toBeNull();
  return Number(match![1]);
}

describe('table overlay stacking', () => {
  it('keeps the Gin result sheet above controls and FX', () => {
    expect(zIndexFor(gin, '.handEnd')).toBeGreaterThan(zIndexFor(table, '.actionRail'));
    expect(zIndexFor(gin, '.handEnd')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
  });

  it('keeps Hearts pass UI clear of the local hand and north seat', () => {
    expect(zIndexFor(hearts, '.passBanner')).toBeGreaterThan(zIndexFor(table, '.localHand'));
    expect(declarationsFor(hearts, '.passBanner')).toMatch(/bottom:\s*30%;/);
    expect(declarationsFor(hearts, '.tableBadges')).toMatch(
      /top:\s*clamp\(7\.75rem,\s*20vh,\s*9rem\);/,
    );
  });

  it('keeps President role moments above the next-deal flights', () => {
    expect(zIndexFor(president, '.celebration')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
  });

  it('keeps Wild jump-in notices above flights and moves short-screen badges beside the center', () => {
    expect(zIndexFor(wild, '.jumpBanner')).toBeGreaterThan(zIndexFor(table, '.fxLayer'));
    expect(wild).toMatch(
      /@media \(max-height:\s*560px\)[\s\S]*?\.tableBadges\s*\{[^}]*left:\s*19%;[^}]*top:\s*31%;[^}]*transform:\s*none;/,
    );
  });

  it('lifts the Wild last-card call off the hand rail on a portrait phone', () => {
    // The shared rail is pinned bottom-right, which on a phone is on top of the
    // fanned hand and inside the home indicator's reach. Wild's one-turn
    // last-card window has to be somewhere a thumb can find it, so on portrait
    // it centres above the felt with the table's other decision prompts.
    const portraitRail = wild.match(
      /@media \(orientation:\s*portrait\)\s*\{[\s\S]*?\.actionRail\.actionRail\s*\{([^}]*)\}/,
    );
    expect(portraitRail, 'wild overrides the action rail on portrait').not.toBeNull();
    expect(portraitRail![1]).toMatch(/right:\s*auto;/);
    expect(portraitRail![1]).toMatch(/left:\s*50%;/);
    expect(portraitRail![1]).toMatch(/bottom:\s*27%;/);
    expect(zIndexFor(wild, '.actionRail.actionRail')).toBeGreaterThan(
      zIndexFor(table, '.localHand'),
    );
  });

  it('sweeps the Wild turn clock from CSS rather than a render loop', () => {
    // Driving the ring from React meant a re-render ten times a second for the
    // whole of every turn; the sweep is linear over a known duration, so the
    // stylesheet owns it and the component only ticks the digit.
    expect(wild).toMatch(
      /\.turnClockProgress\s*\{[^}]*animation:\s*turnClockSweep var\(--turn-duration[^}]*\}/,
    );
    expect(wild).toMatch(/@keyframes turnClockSweep/);
    expect(wild).not.toMatch(/transition:\s*stroke-dashoffset/);
  });

  it('parks the Euchre trump badge below the north player', () => {
    expect(declarationsFor(euchre, '.trumpBadge')).toMatch(
      /top:\s*clamp\(6\.4rem,\s*17vh,\s*7\.8rem\);/,
    );
  });

  it('keeps the table wipe over the only other layer it shares the body with', () => {
    // Everything a page draws — including its own fixed sheets — is boxed
    // inside the `z-10` app shell, so the wipe only has to clear the splash.
    // If it did not, the logo would sit on top of the panels on a cold start.
    expect(zIndexFor(wipe, '.overlay')).toBeGreaterThan(zIndexFor(splash, '.overlay'));
  });

  it('rests the wipe emblem in its settled pose so it can be swept back out', () => {
    // Each part animates in on `covered` and is carried out by `emblemOut` on
    // `reveal`. If a part were parked at `opacity: 0`, the entrance rule would
    // stop applying the instant the status changed and it would vanish before
    // the exit had a frame to play.
    for (const part of ['.kicker', '.title', '.rule', '.sub', '.fanCard']) {
      expect(declarationsFor(wipe, part), `${part} rests visible`).not.toMatch(/opacity:\s*0\s*;/);
    }
  });

  it('covers the window rather than the viewport the browser admits to', () => {
    // `100dvh` stops short of the iOS home indicator in a standalone PWA, which
    // would leave a strip of the outgoing table showing under the panels.
    expect(declarationsFor(wipe, '.overlay')).toMatch(/height:\s*var\(--app-height\);/);
  });
});

describe('table menu on a phone', () => {
  it('keeps the whole menu reachable however short the window is', () => {
    // The panel used to be a single column with no ceiling: on a handset in
    // landscape it ran off both ends of the screen, taking Quit with it.
    const panel = declarationsFor(table, '.menuPanel');
    expect(panel).toMatch(/max-height:\s*100%;/);
    expect(panel).toMatch(/overflow-y:\s*auto;/);

    const overlay = declarationsFor(table, '.menuOverlay');
    expect(overlay).toMatch(/env\(safe-area-inset-top\)/);
    expect(overlay).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('lays the settings out in two columns when the window is short and wide', () => {
    const landscapeBlocks = [
      ...table.matchAll(
        /@media \(orientation: landscape\) and \(max-height: 560px\)\s*\{([\s\S]*?)\n\}/g,
      ),
    ].map((block) => block[1]!);
    const rules = landscapeBlocks.find((block) => block.includes('.menuPanel'));
    expect(rules, 'the menu declares a landscape layout').toBeDefined();
    expect(rules).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    // The transport and the ways out read across the whole panel; the pickers
    // pair up beside each other.
    expect(rules).toMatch(/\.menuSectionWide[\s\S]*?grid-column:\s*1 \/ -1;/);
    expect(rules).toMatch(/\.menuActions\s*\{[^}]*flex-direction:\s*row;/);
  });
});

describe('table compositor diet', () => {
  const dropFx = readStyles('drop-fx');

  it('does not promote every card with backface-visibility', () => {
    expect(declarationsFor(table, '.card')).not.toMatch(/backface-visibility/);
  });

  /**
   * The seat plate keeps its `will-change`, and that is deliberate.
   *
   * Dropping it looked like free money — a still seat does not need a layer —
   * but it was measured both ways. It removed at most six layers, because
   * Motion promotes the plate anyway for the scale it plays on a turn change,
   * and against that it changed how the overlapping opponent fan rasterised:
   * a screenshot diff of the settled table moved by 1.9% of its pixels across
   * the whole upper arc. The look is not for sale at that price.
   */
  it('keeps the seat plate promoted, because un-promoting it moved the fan', () => {
    expect(declarationsFor(table, '.seat')).toMatch(/will-change:\s*transform/);
  });

  it('drops the opponent deal-in fill so settled fans are not kept composited', () => {
    expect(table).toMatch(
      /\.opponentCards > \* \{[^}]*animation:\s*dealtCardSettle 240ms var\(--ease-pop\) backwards;/,
    );
    expect(table).not.toMatch(/dealtCardSettle[^;]*\bboth\b/);
    expect(table).toMatch(
      /\.localHand\[data-deal-state='complete'\] \.handTrack \{[^}]*animation:\s*dealFanBloom 360ms var\(--ease-pop\) backwards;/,
    );
    expect(table).not.toMatch(/dealFanBloom[^;]*\bboth\b/);
  });

  it('hides an empty pickup overlay instead of holding a full-viewport layer', () => {
    expect(wild).toMatch(/\.pickupLayer:not\(:has\(\.pickup\)\)\s*\{[^}]*display:\s*none;/);
    expect(declarationsFor(wild, '.pickupLayer')).not.toMatch(/inset:\s*0/);
  });

  it('anchors drop flourishes at the pile instead of a full-viewport grouping layer', () => {
    expect(declarationsFor(dropFx, '.layer')).not.toMatch(/inset:\s*0/);
    expect(declarationsFor(dropFx, '.layer')).toMatch(/left:\s*50%;/);
    expect(declarationsFor(dropFx, '.layer')).toMatch(/top:\s*46%;/);
  });

  it('pulses stock, last-card, and the urgent clock with opacity or scale, not filter', () => {
    expect(wild).toMatch(/@keyframes stockBeckon\s*\{[^}]*opacity:\s*0;/);
    expect(wild).not.toMatch(/@keyframes stockBeckon\s*\{[^}]*filter:/);
    expect(wild).toMatch(/@keyframes lastCardPulse\s*\{[^}]*transform:\s*scale/);
    expect(wild).not.toMatch(/@keyframes lastCardPulse\s*\{[^}]*box-shadow:/);
    expect(wild).toMatch(/@keyframes turnClockUrgent\s*\{[^}]*scale:\s*1\.08;/);
    expect(wild).not.toMatch(/@keyframes turnClockUrgent\s*\{[^}]*box-shadow:/);
    expect(wild).not.toMatch(/@keyframes turnClockUrgent\s*\{[^}]*filter:/);
  });

  it('does not filter a flying card every frame', () => {
    expect(declarationsFor(table, '.flightCardVisual')).not.toMatch(/filter:/);
    expect(declarationsFor(table, '.flightCardVisual .card')).toMatch(/box-shadow:/);
  });

  it('does not interpolate or hover-swap a CSS filter on the hand', () => {
    const card = table.match(/^\.card\s*\{([^}]*)\}/m);
    expect(card, '.card exists').not.toBeNull();
    expect(card![1]).toMatch(/transition:\s*transform 140ms/);
    expect(card![1]).not.toMatch(/filter/);
    expect(declarationsFor(table, '.localHand button.card:not(:disabled):hover')).not.toMatch(
      /filter:/,
    );
  });
});

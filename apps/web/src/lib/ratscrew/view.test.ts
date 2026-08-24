import { createFx } from '@parlour/engine';
import { applyPreset, createSession } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ratscrewGame } from '@parlour/game-ratscrew';
import {
  RATSCREW_MODES,
  getRatscrewMode,
  isRatscrewModeId,
  ratscrewModeForRules,
} from './modes';
import { ratscrewTableView, slapPatternLabel } from './view';

function snapshotFor(seats: number, config: Parameters<typeof createSession>[1]['config']) {
  const session = createSession(ratscrewGame, { seed: 7, config, seats });
  const players = Array.from({ length: seats }, (_, seat) => ({
    seat,
    name: seat === 0 ? 'You' : `Bot ${seat}`,
    avatarId: seat === 0 ? 'ember' : 'slate',
    isBot: seat !== 0,
  }));
  return { mode: 'classic' as const, session, players };
}

describe('rat screw table view', () => {
  it('maps a fresh deal: stacks counted, center empty, seat 0 to flip', () => {
    const snapshot = snapshotFor(4, ratscrewGame.configSchema.defaults());
    const view = ratscrewTableView(snapshot, [{ id: 'flip' }, { id: 'slap' }]);
    expect(view.localSeat).toBe(0);
    expect(view.players.map((p) => p.stackCount)).toEqual([13, 13, 13, 13]);
    expect(view.centerCount).toBe(0);
    expect(view.center).toEqual([]);
    expect(view.turnSeat).toBe(0);
    expect(view.window).toBeNull();
    expect(view.challenge).toBeNull();
    expect(view.decision).toBe('flip');
    expect(view.legal).toEqual({ flip: true, slap: true });
  });

  it('reads the top of the center pile top-first', () => {
    const snapshot = snapshotFor(2, ratscrewGame.configSchema.defaults());
    const session = {
      ...snapshot.session,
      state: {
        ...snapshot.session.state,
        center: ['H5', 'S9', 'D5'] as string[],
      },
    };
    const view = ratscrewTableView({ ...snapshot, session }, []);
    expect(view.center).toEqual(['D5', 'S9', 'H5']);
    expect(view.centerCount).toBe(3);
  });

  it('surfaces live windows with their duration for the countdown bar', () => {
    const config = ratscrewGame.configSchema.resolve({ slapWindowMs: 800 });
    const snapshot = snapshotFor(2, config);
    const session = {
      ...snapshot.session,
      state: {
        ...snapshot.session.state,
        window: { pattern: 'double' as const, openedAtMs: 4200 },
        turn: 1 as number,
      },
    };
    const view = ratscrewTableView({ ...snapshot, session }, [{ id: 'slap' }]);
    expect(view.turnSeat).toBeNull(); // races pause the flip order
    expect(view.window).toEqual({ pattern: 'double', elapsedMs: 4200, durationMs: 800 });
    expect(view.phaseLabel).toContain('SLAP');
    expect(slapPatternLabel('double')).toBe('Double!');
  });

  it('shows face-card challenges against the local player by name', () => {
    const snapshot = snapshotFor(2, ratscrewGame.configSchema.defaults());
    const session = {
      ...snapshot.session,
      state: {
        ...snapshot.session.state,
        challenge: { challenger: 1, target: 0, chancesLeft: 3 },
      },
    };
    const view = ratscrewTableView({ ...snapshot, session }, []);
    expect(view.challenge).toEqual({ challenger: 1, target: 0, chancesLeft: 3 });
    expect(view.phaseLabel).toContain('3 chances left');
  });

  it('keeps risk slaps legal between flips when burns are on', () => {
    const snapshot = snapshotFor(2, ratscrewGame.configSchema.resolve({ misSlapBurn: false }));
    const view = ratscrewTableView(snapshot, [{ id: 'flip' }]);
    expect(view.legal.slap).toBe(false);
    expect(ratscrewModeForRules(snapshot.session.config)).toBe('classic');
  });
});

describe('rat screw mode catalog', () => {
  it('ships three presentation presets backed by package schema ids', () => {
    expect(RATSCREW_MODES.map((mode) => mode.id)).toEqual([
      'classic',
      'quick-reflex',
      'slaphappy',
    ]);
    for (const mode of RATSCREW_MODES) {
      expect(() => applyPreset(ratscrewGame.configSchema, mode.id)).not.toThrow();
    }
  });

  it('classifies rule sets back into modes', () => {
    expect(isRatscrewModeId('classic')).toBe(true);
    expect(isRatscrewModeId('nope')).toBe(false);
    expect(getRatscrewMode('quick-reflex').facts.length).toBeGreaterThan(0);
    const schema = ratscrewGame.configSchema;
    expect(ratscrewModeForRules(schema.resolve({}))).toBe('classic');
    expect(ratscrewModeForRules(schema.resolve({ slapWindowMs: 700 }))).toBe('quick-reflex');
    expect(ratscrewModeForRules(schema.resolve({ runs: true }))).toBe('slaphappy');
  });

  it('emits no fx of its own — views stay pure', () => {
    const fx = createFx();
    fx.emit('ratscrew.slap', { seat: 0, pattern: 'double' });
    expect(fx.events).toHaveLength(1);
  });
});

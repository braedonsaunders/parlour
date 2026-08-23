import { describe, expect, it } from 'vitest';
import { applyPreset, defineConfig } from './config';
import type { ConfigField, ConfigPreset } from './types';

interface TestRules {
  knockAt: number;
  aceHigh: boolean;
  format: string;
  [key: string]: boolean | number | string;
}

const fields: readonly ConfigField[] = [
  { key: 'knockAt', kind: 'int', label: 'Knock at', min: 0, max: 10, default: 3 },
  { key: 'aceHigh', kind: 'toggle', label: 'Ace high', default: true },
  {
    key: 'format',
    kind: 'enum',
    label: 'Format',
    options: [
      { value: 'lives', label: 'Lives' },
      { value: 'race', label: 'Race' },
    ],
    default: 'lives',
  },
];

const presets: readonly ConfigPreset<TestRules>[] = [
  { id: 'sprint', label: 'Sprint', values: { format: 'race', knockAt: 0 } },
];

const schema = defineConfig<TestRules>(fields, presets);

describe('defineConfig', () => {
  it('returns fresh defaults each call', () => {
    const a = schema.defaults();
    const b = schema.defaults();
    expect(a).toEqual({ knockAt: 3, aceHigh: true, format: 'lives' });
    expect(a).not.toBe(b);
    a.knockAt = 9;
    expect(schema.defaults().knockAt).toBe(3);
  });

  it('merges a partial over defaults', () => {
    expect(schema.resolve({ aceHigh: false })).toEqual({
      knockAt: 3,
      aceHigh: false,
      format: 'lives',
    });
  });

  it('ignores unknown keys and undefined values', () => {
    const resolved = schema.resolve({ nope: 1, knockAt: undefined } as Partial<TestRules>);
    expect(resolved).toEqual(schema.defaults());
  });

  it('clamps ints and falls back on invalid enums/toggles', () => {
    expect(schema.resolve({ knockAt: 99 }).knockAt).toBe(10);
    expect(schema.resolve({ knockAt: -5 }).knockAt).toBe(0);
    expect(schema.resolve({ knockAt: 4.6 }).knockAt).toBe(5);
    expect(schema.resolve({ format: 'bogus' }).format).toBe('lives');
    expect(schema.resolve({ aceHigh: 'yes' as unknown as boolean }).aceHigh).toBe(true);
  });

  it('applies named presets over defaults', () => {
    expect(applyPreset(schema, 'sprint')).toEqual({
      knockAt: 0,
      aceHigh: true,
      format: 'race',
    });
    expect(() => applyPreset(schema, 'missing')).toThrow(/unknown config preset/);
  });

  it('exposes fields and presets for generated UI', () => {
    expect(schema.fields).toBe(fields);
    expect(schema.presets.map((p) => p.id)).toEqual(['sprint']);
  });
});

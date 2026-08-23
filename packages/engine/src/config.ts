import type {
  ConfigField,
  ConfigFieldValue,
  ConfigPreset,
  ConfigSchema,
  RuleValues,
} from './types';

function coerce(field: ConfigField, value: ConfigFieldValue): ConfigFieldValue {
  switch (field.kind) {
    case 'toggle':
      return typeof value === 'boolean' ? value : field.default;
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return field.default;
      return Math.min(field.max, Math.max(field.min, Math.round(value)));
    }
    case 'enum':
      return field.options.some((o) => o.value === value) ? value : field.default;
  }
}

/**
 * Builds the typed rule-config schema for a game. Room settings UI is generated
 * from `fields`, so every knob a game supports must be declared here (spec §4.1).
 */
export function defineConfig<C extends RuleValues>(
  fields: readonly ConfigField[],
  presets: readonly ConfigPreset<C>[] = [],
): ConfigSchema<C> {
  const defaults = (): C => {
    const out: RuleValues = {};
    for (const field of fields) out[field.key] = field.default;
    return out as C;
  };

  return {
    fields,
    presets,
    defaults,
    resolve(values: Partial<C>): C {
      const out = defaults() as RuleValues;
      for (const field of fields) {
        const given = (values as RuleValues | undefined)?.[field.key];
        if (given === undefined) continue;
        out[field.key] = coerce(field, given);
      }
      return out as C;
    },
  };
}

export function applyPreset<C extends RuleValues>(schema: ConfigSchema<C>, presetId: string): C {
  const preset = schema.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`unknown config preset: ${presetId}`);
  return schema.resolve(preset.values);
}

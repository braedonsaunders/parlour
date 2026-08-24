'use client';

import { useId, useMemo, useState } from 'react';
import type { ConfigField, ConfigFieldValue, ConfigSchema, RuleValues } from '@parlour/engine';
import styles from '@/styles/rules.module.css';

export type RuleSettingsProps<C extends RuleValues> = {
  /** The game's declared knobs. Every control here is generated from it. */
  schema: ConfigSchema<C>;
  /** Current values — normally `schema.resolve(overrides)` from the setup store. */
  values: C;
  onChange: (key: string, value: ConfigFieldValue) => void;
  /** Restores the values the selected preset ships with. */
  onReset?: () => void;
  /** Fields marked `advanced` start folded away; set true to open them. */
  defaultOpen?: boolean;
  label?: string;
};

/**
 * Renders any game's rule config. Games declare fields (with optional `group`,
 * `help` and `advanced` hints) in their `configSchema`; nothing here is Wild
 * specific, so a new game gets a settings panel for free.
 */
export function RuleSettings<C extends RuleValues>({
  schema,
  values,
  onChange,
  onReset,
  defaultOpen = false,
  label = 'Advanced options',
}: RuleSettingsProps<C>) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  const { basic, advanced } = useMemo(() => split(schema.fields), [schema.fields]);
  const changed = schema.fields.filter((field) => values[field.key] !== field.default).length;

  if (schema.fields.length === 0) return null;

  return (
    <section className={`${styles.panel} panel-soft`} data-testid="rule-settings">
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          {label}
          {changed > 0 && (
            <em className={styles.changed} data-testid="rules-changed">
              {changed} changed
            </em>
          )}
        </span>
        <i aria-hidden="true" data-open={open}>
          ▾
        </i>
      </button>

      {open && (
        <div id={panelId} className={styles.body}>
          {groupsOf(basic).map(([group, fields]) => (
            <FieldGroup
              key={group}
              heading={group}
              fields={fields}
              values={values}
              onChange={onChange}
            />
          ))}
          {advanced.length > 0 && (
            <>
              <p className={styles.houseNote}>
                House rules — these change how the game plays, not just how long it runs.
              </p>
              {groupsOf(advanced).map(([group, fields]) => (
                <FieldGroup
                  key={group}
                  heading={group}
                  fields={fields}
                  values={values}
                  onChange={onChange}
                />
              ))}
            </>
          )}
          {onReset && (
            <button type="button" className={styles.reset} onClick={onReset}>
              Reset to table default
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function split(fields: readonly ConfigField[]) {
  return {
    basic: fields.filter((field) => !field.advanced),
    advanced: fields.filter((field) => field.advanced),
  };
}

/** Preserves declaration order for both the groups and the fields inside them. */
function groupsOf(fields: readonly ConfigField[]): [string, ConfigField[]][] {
  const groups = new Map<string, ConfigField[]>();
  for (const field of fields) {
    const key = field.group ?? 'Rules';
    groups.set(key, [...(groups.get(key) ?? []), field]);
  }
  return [...groups.entries()];
}

function FieldGroup({
  heading,
  fields,
  values,
  onChange,
}: {
  heading: string;
  fields: readonly ConfigField[];
  values: RuleValues;
  onChange: (key: string, value: ConfigFieldValue) => void;
}) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupHeading}>{heading}</h3>
      {fields.map((field) => (
        <Field key={field.key} field={field} value={values[field.key]} onChange={onChange} />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: ConfigFieldValue | undefined;
  onChange: (key: string, value: ConfigFieldValue) => void;
}) {
  const id = useId();
  const current = value ?? field.default;

  return (
    <div className={styles.field} data-field={field.key}>
      <div className={styles.fieldText}>
        <label htmlFor={id}>{field.label}</label>
        {field.help && <p>{field.help}</p>}
      </div>
      {field.kind === 'toggle' && (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={current === true}
          aria-label={field.label}
          className={styles.toggle}
          onClick={() => onChange(field.key, current !== true)}
        >
          <i aria-hidden="true" />
        </button>
      )}
      {field.kind === 'int' && (
        <div className={styles.stepper} role="group" aria-label={field.label}>
          <button
            type="button"
            aria-label={`Decrease ${field.label}`}
            disabled={Number(current) <= field.min}
            onClick={() => onChange(field.key, Math.max(field.min, Number(current) - 1))}
          >
            −
          </button>
          <output id={id}>{Number(current)}</output>
          <button
            type="button"
            aria-label={`Increase ${field.label}`}
            disabled={Number(current) >= field.max}
            onClick={() => onChange(field.key, Math.min(field.max, Number(current) + 1))}
          >
            +
          </button>
        </div>
      )}
      {field.kind === 'enum' && (
        <div className={styles.choices} role="group" aria-label={field.label}>
          {field.options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={option.value === current}
              onClick={() => onChange(field.key, option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

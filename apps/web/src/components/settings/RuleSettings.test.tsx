import { act, createElement } from 'react';
import { defineConfig } from '@parlour/engine';
import { wildpileConfig } from '@parlour/game-wildpile';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuleSettings } from './RuleSettings';

type DemoRules = {
  loud: boolean;
  seats: number;
  pace: string;
  [key: string]: boolean | number | string;
};

const DEMO = defineConfig<DemoRules>([
  { key: 'loud', kind: 'toggle', label: 'Loud', default: false, group: 'Table' },
  { key: 'seats', kind: 'int', label: 'Seats', min: 2, max: 4, default: 3, group: 'Table' },
  {
    key: 'pace',
    kind: 'enum',
    label: 'Pace',
    default: 'brisk',
    advanced: true,
    group: 'House rules',
    options: [
      { value: 'brisk', label: 'Brisk' },
      { value: 'slow', label: 'Slow' },
    ],
  },
]);

describe('RuleSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Partial<Parameters<typeof RuleSettings<DemoRules>>[0]> = {}) => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        createElement(RuleSettings<DemoRules>, {
          schema: DEMO,
          values: DEMO.defaults(),
          onChange,
          defaultOpen: true,
          ...props,
        }),
      ),
    );
    return onChange;
  };

  it('generates a control per declared field, grouped and labelled', () => {
    render();
    expect(container.querySelector('[data-field="loud"] [role="switch"]')).not.toBeNull();
    expect(container.querySelector('[data-field="seats"] output')?.textContent).toBe('3');
    expect(container.querySelectorAll('[data-field="pace"] [role="group"] button')).toHaveLength(2);
    expect(container.textContent).toContain('Table');
    expect(container.textContent).toContain('House rules');
  });

  it('reports edits by key without owning the value', () => {
    const onChange = render();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-field="loud"] [role="switch"]')?.click(),
    );
    expect(onChange).toHaveBeenCalledWith('loud', true);

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-field="seats"] button[aria-label="Increase Seats"]',
        )
        ?.click(),
    );
    expect(onChange).toHaveBeenCalledWith('seats', 4);

    act(() =>
      container.querySelectorAll<HTMLButtonElement>('[data-field="pace"] button')[1]?.click(),
    );
    expect(onChange).toHaveBeenCalledWith('pace', 'slow');
  });

  it('clamps the stepper at the field bounds', () => {
    render({ values: { ...DEMO.defaults(), seats: 4 } });
    const increase = container.querySelector<HTMLButtonElement>(
      '[data-field="seats"] button[aria-label="Increase Seats"]',
    );
    expect(increase?.disabled).toBe(true);
  });

  it('folds away until opened and counts how far the table has drifted', () => {
    render({ defaultOpen: false, values: { ...DEMO.defaults(), loud: true } });
    expect(container.querySelector('[data-field="loud"]')).toBeNull();
    expect(container.querySelector('[data-testid="rules-changed"]')?.textContent).toBe('1 changed');

    act(() => container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click());
    expect(container.querySelector('[data-field="loud"]')).not.toBeNull();
  });

  it("drives Wild's real schema, house rules included", () => {
    act(() =>
      root.render(
        createElement(RuleSettings, {
          schema: wildpileConfig,
          values: wildpileConfig.defaults(),
          onChange: vi.fn(),
          defaultOpen: true,
        }),
      ),
    );

    for (const key of [
      'handSize',
      'stackDrawTwo',
      'stackDrawFour',
      'jumpIn',
      'sevenZero',
      'swapCards',
    ]) {
      expect(container.querySelector(`[data-field="${key}"]`), key).not.toBeNull();
    }
  });
});

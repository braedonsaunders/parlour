'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useT } from '@/lib/i18n';
import styles from '@/styles/modes.module.css';

/**
 * The footer vocabulary of a setup screen: the panel a game settles its table
 * in, the two ways it states a seat count, and the row of actions that leaves
 * for a table. Every game page wrote these out by hand, which is how the pages
 * came to disagree about whether seats are picked with `aria-pressed` buttons
 * or `role="radio"` ones, and how wide a "Play solo" button is.
 */

const CHIP =
  'rounded-fat border-2 px-3.5 py-1.5 font-display text-sm font-extrabold transition-transform duration-150 ease-pop hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60';
const CHIP_ON = 'border-hearth-700 bg-gradient-to-b from-hearth-300 to-hearth-500 text-hearth-900';
const CHIP_OFF = 'border-dusk-700/60 bg-dusk-950/70 text-dusk-100';

/** The row a game settles its table in — seats on the left, bot skill right. */
export function SetupPanel({ children }: { children: ReactNode }) {
  return (
    <div className="panel-soft flex flex-wrap items-center justify-between gap-4 p-3.5">
      {children}
    </div>
  );
}

/** A setting with nothing to choose — "Two seats · you deal first". */
export function SetupFact({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">{label}</p>
      <p className="mt-1.5 font-display text-sm font-extrabold text-hearth-50">{value}</p>
      {hint && <p className={`${styles.fitHint} mt-1 text-xs text-dusk-200/80`}>{hint}</p>}
    </div>
  );
}

/** How many chairs to fill, for the games that let a player choose. */
export function SeatPicker({
  label,
  options,
  value,
  onChange,
  hint,
  disabled,
}: {
  label?: string;
  options: readonly number[];
  value: number;
  onChange: (seats: number) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const t = useT();
  const heading = label ?? t('setup.seats');
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">{heading}</p>
      <div className="mt-1.5 flex items-center gap-2" role="group" aria-label={heading}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`${CHIP} ${option === value ? CHIP_ON : CHIP_OFF}`}
          >
            {option}
          </button>
        ))}
      </div>
      {hint && <p className={`${styles.fitHint} mt-1 text-xs text-dusk-200/80`}>{hint}</p>}
    </div>
  );
}

export interface SetupAction {
  label: string;
  /** Shown on this action while the table is being set — "Shuffling up…". */
  busyLabel?: string;
  onClick?: () => void;
  /** Renders a link instead of a button; "Join with a code" is one. */
  href?: string;
  tone?: 'primary' | 'teal' | 'ghost';
  disabled?: boolean;
  /** Native tooltip, for an action a game has reason to hold back. */
  title?: string;
  testId?: string;
}

const TONE = {
  primary: 'btn-fat',
  teal: 'btn-fat btn-fat--teal',
  ghost: 'btn-fat btn-fat--ghost',
} as const;

/**
 * The way out of the setup screen. `busy` belongs to the whole row: once a
 * table is being dealt, no other action on the screen should still be live.
 */
export function SetupActions({
  actions,
  busy = false,
  note,
}: {
  actions: readonly SetupAction[];
  busy?: boolean;
  note?: ReactNode;
}) {
  return (
    <>
      <div className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-3">
        {actions.map((action) => {
          const className = `${TONE[action.tone ?? 'primary']} w-64 text-center text-lg`;
          const label = busy ? (action.busyLabel ?? action.label) : action.label;

          return action.href && !busy ? (
            <Link
              key={action.label}
              href={action.href}
              className={className}
              data-testid={action.testId}
              title={action.title}
            >
              {label}
            </Link>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={busy || action.disabled}
              className={className}
              data-testid={action.testId}
              title={action.title}
            >
              {label}
            </button>
          );
        })}
      </div>
      {note && <p className={`${styles.fitHint} text-center text-xs text-dusk-200/80`}>{note}</p>}
    </>
  );
}

export type SetupTableActionsProps = {
  busy?: boolean;
  /** Shown on Play solo while the table is being set. */
  soloBusyLabel?: string;
  onSolo: () => void;
  /**
   * Friend-room create path. When omitted the row is solo-only — single-seat
   * solitaire (Klondike, Golf) has no rooms.
   */
  createHref?: string;
  createTestId?: string;
  createDisabled?: boolean;
  createTitle?: string;
  note?: ReactNode;
};

/**
 * The three ways off a game type page. Labels live here so Blitz cannot say
 * "Deal me in" / "Create Room" while Wild says "Play solo" / "Create friend
 * room". Pages pass the routes and busy copy; they do not pick the words.
 */
export function SetupTableActions({
  busy = false,
  soloBusyLabel,
  onSolo,
  createHref,
  createTestId,
  createDisabled,
  createTitle,
  note,
}: SetupTableActionsProps) {
  const t = useT();
  const router = useWipeRouter();
  const actions: SetupAction[] = [
    {
      label: t('setup.playSolo'),
      busyLabel: soloBusyLabel,
      onClick: onSolo,
      testId: 'deal-me-in',
    },
  ];
  if (createHref) {
    actions.push(
      {
        label: t('setup.createFriendRoom'),
        tone: 'teal',
        onClick: () => router.push(createHref),
        disabled: createDisabled,
        title: createTitle,
        testId: createTestId,
      },
      { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
    );
  }
  return (
    <>
      <SetupActions actions={actions} busy={busy} note={note} />
    </>
  );
}

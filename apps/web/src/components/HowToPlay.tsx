'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { HowToPlayDoc } from '@parlour/engine';
import { useT } from '@/lib/i18n';
import styles from '@/styles/howto.module.css';
import { useDialogFocus } from '@/components/table/shell/useDialogFocus';

export type HowToPlayModalProps = {
  open: boolean;
  onClose: () => void;
  /** The pack's own instructions, rendered verbatim. */
  doc: HowToPlayDoc;
  /** Shown in the header — usually the game name. */
  title: string;
  /** Optional line under the title, e.g. the selected mode. */
  subtitle?: string;
};

/**
 * Renders a game pack's `howToPlay` doc. Every pack ships its own copy, so this
 * is presentation only — no game knows about this component and it knows about
 * no game.
 */
export function HowToPlayModal({ open, onClose, doc, title, subtitle }: HowToPlayModalProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, dialogRef, closeRef, onClose);

  if (!open) return null;

  // The trigger lives on tiles and inside the table menu. Those hosts use
  // `backdrop-filter` and overflow, which turn `position: fixed` into a
  // local overlay — the sheet then centres in the tile/menu and clips.
  // Portaling to `document.body` keeps every entry matching the setup-header
  // sheet, which already sits on the viewport.
  const sheet = (
    <div
      ref={dialogRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('howto.playTitle', { title })}
      tabIndex={-1}
      data-testid="how-to-play"
      onClick={onClose}
    >
      <div
        className={`${styles.sheet} panel-soft`}
        onClick={(event) => event.stopPropagation()}
        role="document"
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{t('howto.heading')}</span>
            <h2>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={t('howto.close')}
            data-testid="close-how-to-play"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.summary}>{doc.summary}</p>
          <section className={styles.objective}>
            <h3>{t('howto.objective')}</h3>
            <p>{doc.objective}</p>
          </section>

          {doc.sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h3>{section.heading}</h3>
              {section.body?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <dl className={styles.bullets}>
                  {section.bullets.map((bullet) => (
                    <div key={bullet.label}>
                      <dt>{bullet.label}</dt>
                      <dd>{bullet.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
}

export type HowToPlayButtonProps = {
  doc: HowToPlayDoc;
  title: string;
  subtitle?: string;
  /** `chip` sits inline on a tile; `pill` is a standalone control. */
  variant?: 'chip' | 'pill';
  className?: string;
  children?: ReactNode;
};

/**
 * A rules button plus the sheet it opens. Drops onto a game tile, a mode tile
 * or a table menu without the host having to own any modal state.
 */
export function HowToPlayButton({
  doc,
  title,
  subtitle,
  variant = 'pill',
  className,
  children,
}: HowToPlayButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, styles[variant], className].filter(Boolean).join(' ')}
        data-testid={`how-to-play-${title.toLowerCase().replace(/\s+/g, '-')}`}
        aria-label={t('howto.playTitle', { title })}
        onClick={(event) => {
          // Tiles are buttons themselves; opening the rules must not also pick
          // the game underneath.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children ?? (
          <>
            <span aria-hidden="true">?</span>
            {variant === 'pill' && t('howto.heading')}
          </>
        )}
      </button>
      <HowToPlayModal
        open={open}
        onClose={() => setOpen(false)}
        doc={doc}
        title={title}
        subtitle={subtitle}
      />
    </>
  );
}

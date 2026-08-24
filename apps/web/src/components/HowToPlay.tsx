'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import styles from '@/styles/howto.module.css';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`How to play ${title}`}
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
            <span className={styles.eyebrow}>How to play</span>
            <h2>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close how to play"
            data-testid="close-how-to-play"
            onClick={onClose}
            autoFocus
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.summary}>{doc.summary}</p>
          <section className={styles.objective}>
            <h3>How you win</h3>
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={[styles.trigger, styles[variant], className].filter(Boolean).join(' ')}
        data-testid={`how-to-play-${title.toLowerCase().replace(/\s+/g, '-')}`}
        aria-label={`How to play ${title}`}
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
            {variant === 'pill' && 'How to play'}
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

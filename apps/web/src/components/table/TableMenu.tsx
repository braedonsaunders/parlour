'use client';

import { useEffect, useState } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import { HowToPlayButton } from '@/components/HowToPlay';
import { useAudioManager, useAudioStore } from '@/stores/audio';
import { SCENE_IDS, SCENE_LABELS, useSceneStore, type SceneId } from '@/stores/scene';
import {
  DROP_EFFECT_LABELS,
  DROP_EFFECT_LEVELS,
  useTableFxStore,
  type DropEffectLevel,
} from '@/stores/tableFx';
import { useProfileStore } from '@/stores/profile';
import { MusicControls } from '@/components/MusicControls';
import styles from '@/styles/table.module.css';

const SCENE_ICONS: Record<SceneId, string> = {
  campfire: '🔥',
  casino: '🎲',
  snug: '🛋️',
};

export type TableMenuProps = {
  /** The running game's instructions, so rules stay reachable mid-match. */
  howToPlay?: { doc: HowToPlayDoc; title: string; subtitle?: string };
  open: boolean;
  onClose: () => void;
  /** Fired only after the player confirms leaving the match. */
  onQuit: () => void;
};

export function TableMenu({ open, onClose, onQuit, howToPlay }: TableMenuProps) {
  const dropEffects = useTableFxStore((state) => state.dropEffects);
  const setDropEffects = useTableFxStore((state) => state.setDropEffects);
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setConfirmingQuit(false);
  }
  useAudioManager();
  const muted = useAudioStore((state) => state.channels.master.muted);
  const toggleMuted = useAudioStore((state) => state.toggleMuted);
  const reducedMotion = useProfileStore((state) => state.settings.reducedMotion);
  const updateSettings = useProfileStore((state) => state.updateSettings);
  const sceneId = useSceneStore((state) => state.sceneId);
  const setScene = useSceneStore((state) => state.setScene);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.menuOverlay} data-testid="table-menu">
      <button
        type="button"
        className={styles.menuScrim}
        aria-label="Back to the table"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={confirmingQuit ? 'Quit this match?' : 'Table menu'}
        className={`${styles.menuPanel} panel-soft`}
      >
        {confirmingQuit ? (
          <>
            <h2 className={styles.menuTitle}>Quit this match?</h2>
            <p className={styles.menuHint}>
              You&rsquo;ll fold your seat and head back to the menu. The match won&rsquo;t wait.
            </p>
            <div className={styles.menuActions}>
              <button type="button" className="btn-fat" onClick={() => setConfirmingQuit(false)}>
                Keep playing
              </button>
              <button
                type="button"
                className={`${styles.quitButton} btn-fat btn-fat--danger`}
                data-testid="confirm-quit"
                onClick={onQuit}
              >
                Quit match
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.menuTitle}>Table menu</h2>
            <div className={styles.menuToggles}>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                aria-pressed={!muted}
                onClick={() => toggleMuted('master')}
              >
                Sound {muted ? 'off' : 'on'}
              </button>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                aria-pressed={reducedMotion}
                onClick={() => updateSettings({ reducedMotion: !reducedMotion })}
              >
                Calm motion {reducedMotion ? 'on' : 'off'}
              </button>
            </div>
            <section aria-label="Background" data-testid="background-picker">
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                Background
              </p>
              <div role="radiogroup" className="flex items-center justify-center gap-1">
                {SCENE_IDS.map((scene) => {
                  const active = scene === sceneId;
                  return (
                    <button
                      key={scene}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid={`scene-${scene}`}
                      onClick={() => setScene(scene)}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ease-pop ${
                        active
                          ? 'bg-hearth-400/25 text-hearth-100'
                          : 'text-dusk-200/70 hover:-translate-y-0.5 hover:text-dusk-100'
                      }`}
                    >
                      <span aria-hidden="true">{SCENE_ICONS[scene]}</span>
                      {SCENE_LABELS[scene]}
                    </button>
                  );
                })}
              </div>
            </section>
            <section aria-label="Card effects" data-testid="drop-effects-picker">
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                Card effects
              </p>
              <div role="radiogroup" className="flex items-center justify-center gap-1">
                {DROP_EFFECT_LEVELS.map((level) => {
                  const active = level === dropEffects;
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid={`drop-effects-${level}`}
                      onClick={() => setDropEffects(level as DropEffectLevel)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ease-pop ${
                        active
                          ? 'bg-hearth-400/25 text-hearth-100'
                          : 'text-dusk-200/70 hover:-translate-y-0.5 hover:text-dusk-100'
                      }`}
                    >
                      {DROP_EFFECT_LABELS[level]}
                    </button>
                  );
                })}
              </div>
            </section>
            {/* The transport is a row of controls, so it takes the full width
                of the landscape grid rather than half of it. */}
            <section
              aria-label="Music"
              data-testid="music-section"
              className={styles.menuSectionWide}
            >
              <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                Music
              </p>
              <MusicControls />
            </section>
            <div className={styles.menuActions}>
              {howToPlay && (
                <HowToPlayButton
                  doc={howToPlay.doc}
                  title={howToPlay.title}
                  subtitle={howToPlay.subtitle}
                  className={styles.menuHelp}
                />
              )}
              <button type="button" className="btn-fat" autoFocus onClick={onClose}>
                Back to the table
              </button>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                data-testid="quit-to-menu"
                onClick={() => setConfirmingQuit(true)}
              >
                Quit to main menu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

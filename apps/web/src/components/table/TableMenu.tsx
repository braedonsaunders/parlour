'use client';

import { useRef, useState } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import { HowToPlayButton } from '@/components/HowToPlay';
import { useT, type MessageKey } from '@/lib/i18n';
import { useAudioManager, useAudioStore } from '@/stores/audio';
import { SCENE_IDS, useSceneStore, type SceneId } from '@/stores/scene';
import { DROP_EFFECT_LEVELS, useTableFxStore, type DropEffectLevel } from '@/stores/tableFx';
import { useProfileStore } from '@/stores/profile';
import { MusicControls } from '@/components/MusicControls';
import styles from '@/styles/table.module.css';
import { useDialogFocus } from './shell/useDialogFocus';

const SCENE_ICONS: Record<SceneId, string> = {
  campfire: '🔥',
  casino: '🎲',
  snug: '🛋️',
};

const SCENE_KEYS: Record<SceneId, MessageKey> = {
  campfire: 'scene.campfire',
  casino: 'scene.casino',
  snug: 'scene.snug',
};

const DROP_EFFECT_KEYS: Record<DropEffectLevel, MessageKey> = {
  off: 'tableMenu.cardEffectsOff',
  subtle: 'tableMenu.cardEffectsSubtle',
  full: 'tableMenu.cardEffectsFull',
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
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
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

  useDialogFocus(open, dialogRef, resumeRef, onClose);

  if (!open) return null;

  return (
    <div className={styles.menuOverlay} data-testid="table-menu">
      <button
        type="button"
        className={styles.menuScrim}
        aria-label={t('tableMenu.backToTable')}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={confirmingQuit ? t('tableMenu.quitPrompt') : t('table.menu')}
        tabIndex={-1}
        className={`${styles.menuPanel} panel-soft`}
      >
        {confirmingQuit ? (
          <>
            <h2 className={styles.menuTitle}>{t('tableMenu.quitPrompt')}</h2>
            <p className={styles.menuHint}>{t('tableMenu.quitHint')}</p>
            <div className={styles.menuActions}>
              <button type="button" className="btn-fat" onClick={() => setConfirmingQuit(false)}>
                {t('tableMenu.keepPlaying')}
              </button>
              <button
                type="button"
                className={`${styles.quitButton} btn-fat btn-fat--danger`}
                data-testid="confirm-quit"
                onClick={onQuit}
              >
                {t('tableMenu.quitMatch')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.menuTitle}>{t('table.menu')}</h2>
            <div className={styles.menuToggles}>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                aria-pressed={!muted}
                onClick={() => toggleMuted('master')}
              >
                {t(muted ? 'sound.off' : 'sound.on')}
              </button>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                aria-pressed={reducedMotion}
                onClick={() => updateSettings({ reducedMotion: !reducedMotion })}
              >
                {t(reducedMotion ? 'tableMenu.calmMotionOn' : 'tableMenu.calmMotionOff')}
              </button>
            </div>
            <section aria-label={t('tableMenu.background')} data-testid="background-picker">
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                {t('tableMenu.background')}
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
                      {t(SCENE_KEYS[scene])}
                    </button>
                  );
                })}
              </div>
            </section>
            <section aria-label={t('tableMenu.cardEffects')} data-testid="drop-effects-picker">
              <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                {t('tableMenu.cardEffects')}
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
                      {t(DROP_EFFECT_KEYS[level])}
                    </button>
                  );
                })}
              </div>
            </section>
            {/* The transport is a row of controls, so it takes the full width
                of the landscape grid rather than half of it. */}
            <section
              aria-label={t('tableMenu.music')}
              data-testid="music-section"
              className={styles.menuSectionWide}
            >
              <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.25em] text-dusk-200">
                {t('tableMenu.music')}
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
              <button ref={resumeRef} type="button" className="btn-fat" onClick={onClose}>
                {t('tableMenu.backToTable')}
              </button>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                data-testid="quit-to-menu"
                onClick={() => setConfirmingQuit(true)}
              >
                {t('tableMenu.quitToMenu')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

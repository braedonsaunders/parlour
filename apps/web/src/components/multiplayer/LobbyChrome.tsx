'use client';

import { MainMenuLanguageButton } from '@/components/MainMenuLanguageButton';
import { MainMenuMuteButton } from '@/components/MainMenuMuteButton';
import { ScenePicker } from '@/components/backgrounds/ScenePicker';

/**
 * The title screen's ambience controls, docked around a friend-room lobby.
 * Waiting for players is exactly when someone reaches for the volume, the
 * language, or a nicer background — sound and language sit top-right (the
 * Leave link owns the top-left), and the scene picker keeps its bottom-left.
 */
export function LobbyChrome() {
  return (
    <>
      <div className="chrome-ne fixed z-30 flex items-center gap-2">
        <MainMenuMuteButton />
        <MainMenuLanguageButton />
      </div>
      <ScenePicker />
    </>
  );
}

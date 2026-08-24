'use client';

import { useEffect, useRef } from 'react';

type GameWindow = Window & { render_game_to_text?: () => string };

/**
 * Publishes the table's debug/agent text surface on `window.render_game_to_text`.
 *
 * The builder is read through a ref so the surface always serialises the latest
 * render without re-installing on every dependency change, and teardown only
 * removes the function this table installed.
 */
export function useGameTextSurface(build: () => unknown): void {
  const latest = useRef(build);

  useEffect(() => {
    latest.current = build;
  });

  useEffect(() => {
    const gameWindow = window as GameWindow;
    const renderGameToText = () => JSON.stringify(latest.current());
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, []);
}

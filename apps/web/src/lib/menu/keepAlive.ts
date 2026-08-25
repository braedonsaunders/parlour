import { getAudioManager } from '@/lib/audio/AudioManager';
import { getMusicController } from '@/lib/audio/MusicController';

/**
 * Re-assert the title theme inside a user gesture. iOS standalone PWAs pause
 * HTML5 media when the document URL changes; a play() from a later effect is
 * rejected. Call this synchronously from the tap that navigates.
 */
export function keepMenuAudioAlive(): void {
  try {
    const manager = getAudioManager();
    if (!manager.isUnlocked()) return;
    void manager.resumeContext();
    getMusicController(manager).keepAlive();
  } catch {
    /* navigation must not die if a Howl node is in a bad shape */
  }
}

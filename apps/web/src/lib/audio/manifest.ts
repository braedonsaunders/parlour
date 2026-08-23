import type { SoundDef } from './AudioManager';

export const SOUND_MANIFEST: readonly SoundDef[] = [
  { id: 'card.slide', src: '/audio/card-slide.wav', channel: 'sfx', cap: 4, minInterval: 40 },
  { id: 'card.snap', src: '/audio/card-snap.wav', channel: 'sfx', cap: 4, minInterval: 40 },
  { id: 'deal.riffle', src: '/audio/deal-riffle.wav', channel: 'sfx', cap: 1, minInterval: 300 },
  { id: 'knock.thud', src: '/audio/knock-thud.wav', channel: 'sfx', cap: 1, minInterval: 250 },
  {
    id: 'blitz.fanfare',
    src: '/audio/blitz-fanfare.wav',
    channel: 'sfx',
    cap: 1,
    minInterval: 800,
  },
  { id: 'chip.clink', src: '/audio/chip-clink.wav', channel: 'sfx', cap: 6, minInterval: 30 },
  { id: 'turn.tick', src: '/audio/turn-tick.wav', channel: 'sfx', cap: 2, minInterval: 120 },
  { id: 'ui.pop', src: '/audio/ui-pop.wav', channel: 'sfx', cap: 3, minInterval: 60 },
  { id: 'win.jingle', src: '/audio/win-jingle.wav', channel: 'sfx', cap: 1, minInterval: 1200 },
  { id: 'lose.sting', src: '/audio/lose-sting.wav', channel: 'sfx', cap: 1, minInterval: 1200 },
  {
    id: 'music.parlour',
    src: '/audio/parlour-ambience.wav',
    channel: 'music',
    loop: true,
    cap: 1,
    minInterval: 1000,
    volume: 0.6,
  },
];

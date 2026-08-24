# parlour music — Suno generation pack

Prompts for generating the parlour soundtrack on [suno.com](https://suno.com).
The in-app player (`MusicController`) plays these as **per-scene playlists of
three full-length songs** that cycle forever — regular song endings are fine,
no seam-looping needed. Files drop into `apps/web/public/audio/music/` with the
exact filenames below; until a file exists the player silently skips it and, if
a whole playlist is missing, falls back to `parlour-ambience.wav`.

## The set at a glance

| #   | Scene       | Song               | File                   | Mood                        | Tense       |
| --- | ----------- | ------------------ | ---------------------- | --------------------------- | ----------- |
| 1   | 🔥 Campfire | Ember Watch        | `music-campfire-1.mp3` | Settling in, safe           | Calm        |
| 2   | 🔥 Campfire | Crickets & Coals   | `music-campfire-2.mp3` | Cozy sway, hopeful          | Relaxed     |
| 3   | 🔥 Campfire | Smoke Signals      | `music-campfire-3.mp3` | World asleep, vast          | Drifting    |
| 4   | 🎲 Casino   | Velvet Hour        | `music-casino-1.mp3`   | Doors open, smooth          | Cool        |
| 5   | 🎲 Casino   | Midnight Chip Lead | `music-casino-2.mp3`   | Stakes rising, sneaky       | Tense       |
| 6   | 🎲 Casino   | House Whiskey      | `music-casino-3.mp3`   | Last call, wistful          | Melancholy  |
| 7   | 🛋️ Snug     | Turf & Timber      | `music-snug-1.mp3`     | Warm welcome                | Gentle      |
| 8   | 🛋️ Snug     | Last Bus Home      | `music-snug-2.mp3`     | Bittersweet singalong ghost | Bittersweet |
| 9   | 🛋️ Snug     | The Quiet Round    | `music-snug-3.mp3`     | Lamp lowered, tiny          | Hushed      |
| ★   | 🏠 Menu     | Pull Up a Chair    | `music-title.mp3`      | Front-door welcome          | Inviting    |
| ★   | ⚡ Any      | Knock Knows        | `music-tense.mp3`      | Pressure play, sneaky       | Tense       |

Each trio should feel like one little EP for its scene: shared instrumentation
and key family, with the **tense** arc calm → peak → resolve across the three
songs so the cycling playlist breathes instead of flatlining. The two ★ songs
stand alone: the menu theme plays on the title screen, and the tense cue is the
built-in mood, played only when a game's state asks for it.

## How to generate (per song)

1. Create → **Custom** mode.
2. Paste the song's **Style** prompt into the _Style_ box.
3. Turn **Instrumental ON** (leave lyrics empty).
4. _Exclude styles_: paste the scene's Exclude line (Suno v4.5+ field; if absent, append "avoid:" to the style).
5. Sliders: **Weirdness ~30%**, **Style Influence ~75%**.
6. Generate 2–3 candidates, keep the take that matches the brief's mood/tense
   with no vocal or artifact bleed.

## Delivery checklist (per song)

- Length: **2–3 minutes**, natural ending preferred; if Suno fades out, trim the fade tail to ~1 s so the hand-off to the next song feels alive rather than sleepy.
- Loudness: normalize every song to **−16 LUFS integrated** (true peak ≤ −1 dBTP). Consistency across a scene's three songs matters most — the playlist cycles them back-to-back. The app mixes down through the music channel (default 0.45 × master), landing near the spec's −18 LUFS bed level under SFX.
- Export **MP3 192 kbps CBR stereo**.
- Save to `apps/web/public/audio/music/<filename>.mp3` — filenames are the contract (`apps/web/src/lib/audio/music.ts`).

---

## 1. Campfire 🔥 — cozy night watch around the fire

Shared DNA: cedar flute, felt piano, drones, crickets, tape warmth, minor-key family.
Arc: settle in → cozy sway → embers out.

### 1.1 — Ember Watch · `music-campfire-1.mp3`

- **Mood/tense:** safe and settling — the first five minutes at the fire
- **Energy:** 2/10, barely moving
- **Tempo/key:** slow 66 BPM, A minor

```
Gentle ambient folk lullaby, felt piano melody over low string drone,
distant cedar flute phrases, soft kalimba plinks like sparks,
crickets and faint fire crackle texture, slow 66 BPM, A minor,
warm tape hiss, wide reverb, intimate miniature-world calm, instrumental only
```

### 1.2 — Crickets & Coals · `music-campfire-2.mp3`

- **Mood/tense:** relaxed but alive — swaying, quietly hopeful
- **Energy:** 4/10, gentle pulse
- **Tempo/key:** slow 72 BPM, D minor leaning hopeful

```
Hypnotic acoustic nocturne, fingerpicked nylon guitar ostinato,
muted cello long tones, glockenspiel twinkles, gentle hand drum heartbeat,
crickets at night, slow 72 BPM, D minor leaning hopeful,
campfire intimacy, soft dynamics only, instrumental only
```

### 1.3 — Smoke Signals · `music-campfire-3.mp3`

- **Mood/tense:** drifting, hushed — last ember, world asleep
- **Energy:** 1/10, near-still
- **Tempo/key:** nearly beatless 58 BPM pulse, E minor

```
Sparse meditative folk drone, solo cedar flute lead almost unaccompanied,
deep warm pad like distant mountains, occasional chime,
nearly beatless 58 BPM pulse, E minor, very quiet and vast,
embers settling, seamless mood of a world asleep, instrumental only
```

**Exclude (all campfire):** ` EDM, pop drums, vocals, singing, bright major key, brass, rap, epic orchestral`

---

## 2. Casino 🎲 — smoky midnight lounge

Shared DNA: upright bass, whisper brushes, vibraphone/muted trumpet, minor swing.
Arc: cool open → tense rise → melancholy close.

### 2.1 — Velvet Hour · `music-casino-1.mp3`

- **Mood/tense:** cool confidence — doors open, first chips down
- **Energy:** 5/10, laid-back groove
- **Tempo/key:** 85 BPM swing, F minor

```
Smoky late-night jazz lounge, walking upright bass, whisper-brushed drums,
lazy vibraphone melody, muted trumpet answers, F minor bluesy swing,
85 BPM, intimate cabaret room, vinyl crackle warmth, relaxed and sly,
instrumental only
```

### 2.2 — Midnight Chip Lead · `music-casino-2.mp3`

- **Mood/tense:** properly **tense** — sneaky heist-movie pressure play
- **Energy:** 6/10, forward lean without loudness
- **Tempo/key:** 96 BPM shuffle, G minor

```
Sneaky noir jazz groove, pizzicato bass line, tip-toe drum brushes,
tremolo electric guitar chords, vibraphone stabs, G minor swing shuffle,
96 BPM with forward lean but never loud, heist-movie charm,
smoky back-room tension played soft, instrumental only
```

### 2.3 — House Whiskey · `music-casino-3.mp3`

- **Mood/tense:** melancholy exhale — 2 a.m., empty lounge
- **Energy:** 3/10, ballad stillness
- **Tempo/key:** 68 BPM rubato-ish ballad, C minor

```
Slow bourbon-ballad jazz, rubato piano comping behind a warm muted trumpet,
sparse brushes nearly silent, double bass sighs, C minor,
68 BPM ballad feel, 2 a.m. empty lounge mood, velvet and wistful,
instrumental only
```

**Exclude (all casino):** ` big band horns loud, rock, EDM, vocals, fast bebop, screaming sax, modern hip hop, trap`

---

## 3. Snug 🛋️ — turf fire in an old pub snug

Shared DNA: tin whistle/uilleann air, harp, fiddle long notes, bodhrán barely there.
Arc: warm welcome → bittersweet waltz → lamp lowered.

### 3.1 — Turf & Timber · `music-snug-1.mp3`

- **Mood/tense:** gentle welcome — peat fire, worn leather, one friend waving you over
- **Energy:** 3/10, easy half-time jig
- **Tempo/key:** 74 BPM half-time jig feel, Dorian mode

```
Cozy Celtic air, tin whistle lullaby over harp arpeggios,
fiddle sustained thirds, bodhrán heartbeat barely audible,
old wooden room ambience, turf-fire warmth, Dorian mode,
gentle half-time jig feel at 74 BPM, instrumental only
```

### 3.2 — Last Bus Home · `music-snug-2.mp3`

- **Mood/tense:** bittersweet — the singalong's ghost after everyone's gone
- **Energy:** 4/10, rolling waltz
- **Tempo/key:** 88 BPM 3/4 waltz, G major with mournful flat-seven

```
Nostalgic Celtic folk waltz, concertina and fiddle trading a tender melody,
guitar strums soft as rain on windows, 88 BPM 3/4 waltz,
bittersweet but cozy, G major with a mournful flat-seven,
pub-emptying hour glow, instrumental only
```

### 3.3 — The Quiet Round · `music-snug-3.mp3`

- **Mood/tense:** hushed — smallest music in the set, one lamp burning low
- **Energy:** 1/10, almost free time
- **Tempo/key:** ~60 BPM or free time, B minor

```
Very sparse Celtic sleep-piece, solo uilleann pipe drone with distant harp,
almost no rhythm, B minor, 60 BPM or free time,
one lamp burning low, leather armchairs and peat smoke,
the smallest music in the set, instrumental only
```

**Exclude (all snug):** ` rowdy singalong, punk, rock, full-speed session, vocals, bagpipe march, EDM`

---

## ★ Menu theme 🏠 — Pull Up a Chair · `music-title.mp3`

- **Mood/tense:** inviting — the front door of the pub, logo floating over the dusk diorama
- **Energy:** 3/10, unhurried charm
- **Tempo/key:** gentle 76 BPM waltz feel, D major
- **Plays:** title/home routes instead of a scene playlist; repeats until you sit down at a table

```
Gentle cozy acoustic waltz, felt piano lead, warm nylon guitar fingerpicking,
soft glockenspiel sparkle, muted trumpet far away in the next room,
brushed snare whispers, slow 76 BPM waltz feel in D major,
nostalgic pub-at-closing-time warmth, minimal and airy, instrumental only
```

**Exclude:** ` EDM, dubstep, trap, heavy drums, vocals, singing, rap, distortion, synthwave, epic orchestral`

---

## ★ Tense cue ⚡ — Knock Knows · `music-tense.mp3`

- **Mood/tense:** properly **tense** — someone knocked, clocks are running, every discard matters
- **Energy:** 6/10, coiled and leaning forward without ever getting loud
- **Tempo/key:** steady 100 BPM, E minor
- **Plays:** never pickable in settings — it is the `tense` **mood cue**, armed from game state via `useMusicMood('tense')` (Wild's closing minute, Timed mode's bell, final turns) and released back to the scene playlist afterwards

```
Tense but playful parlor groove, pizzicato string ostinato, prepared piano hits,
soft clapping sticks, muted electric guitar chops, sneaky spy-movie charm,
E minor, steady 100 BPM, head-nod momentum, never frantic,
low dynamic ceiling so game sounds stay on top, instrumental only
```

**Exclude:** ` epic trailer, orchestral blast, rock guitars, EDM drop, vocals, horror dissonance, drum and bass`

---

## Extending: soundtracks for other games

The player is pack-based. Any game module can ship its own soundtrack without
touching the player:

```ts
import { registerMusicPack } from '@/lib/audio/music';

registerMusicPack({
  id: 'wildpile',
  label: 'Wild',
  playlists: {
    campfire: [{ id: 'wild-a', title: 'Chaos Waltz', src: '/audio/music/wild/a.mp3' }],
    // scenes you omit inherit the parlour pack
  },
});
```

Then point the game at it when its screen mounts:

```ts
const controller = useMusicController();
useEffect(() => {
  controller.setPack('wildpile');
  return () => controller.setPack(null);
}, [controller]);
```

Rules of thumb: same delivery checklist as above, keep packs ≤3 songs per scene
so downloads stay light, give the pack its own track ids (they're global), and
write each song its own brief card (title, mood, tense, tempo, key) so the
scene keeps an emotional arc instead of three clones.

## After generation

1. Run each file through the delivery checklist (length + −16 LUFS + MP3 192).
2. Drop into `apps/web/public/audio/music/`.
3. `pnpm dev` → table menu (`•••`) → **Music** section: play/pause, skip, shuffle; switch **Background** to hear each scene's playlist crossfade (~0.9 s).
4. Missing files are skipped automatically — ship songs one at a time.

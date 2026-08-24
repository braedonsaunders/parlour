import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'sfx');
const STYLE =
  'Close-mic studio sound design for a premium cozy tabletop card game. Warm, tactile, polished, natural paperboard, felt, and wood. Start immediately. No speech, no crowd, no ambience, no long reverb tail.';

const sounds = [
  {
    name: 'card-draw-stock',
    duration: 0.7,
    prompt:
      'One standard playing card pulled briskly from the top of a paper card deck: fingertip contact, crisp paperboard scrape, then a light lift. Exactly one action.',
  },
  {
    name: 'card-draw-discard',
    duration: 0.65,
    prompt:
      'One face-up playing card lifted from a discard pile on green felt: a distinct papery peel, tiny edge flick, and clean pickup. Exactly one action.',
  },
  {
    name: 'card-discard-flight',
    duration: 0.65,
    prompt:
      'One playing card whipped a short distance horizontally through the air, a fast compact paperboard swish. No landing impact; only the flight.',
  },
  {
    name: 'card-land-table',
    duration: 0.55,
    prompt:
      'One playing card lands face-up on a felt-covered wooden card table: crisp paperboard slap, tiny edge bounce, immediate settle. No throw or whoosh.',
  },
  {
    name: 'card-flip',
    duration: 0.6,
    prompt:
      'One playing card flips over quickly on a felt card table: tight double paper flutter followed by a soft face-up contact. Exactly one card.',
  },
  {
    name: 'deal-card',
    duration: 0.55,
    prompt:
      'One standard playing card dealt briskly across green felt: short papery zip followed by a soft precise slap. A single dealer action, not a whole deck.',
  },
  {
    name: 'stock-shuffle',
    duration: 1.35,
    prompt:
      'Two hands perform one tight overhand shuffle of a standard paper playing-card deck, controlled card flutter, ending with one tidy square-up tap on felt.',
  },
  {
    name: 'turn-ready',
    duration: 0.5,
    prompt:
      'A single subtle turn-ready notification: a soft felted wooden tick layered with a tiny warm ceramic ping. Tactile, calm, not electronic, no melody.',
  },
  {
    name: 'ui-press',
    duration: 0.5,
    prompt:
      'One small premium game-menu button press: soft wooden mechanism, muted felt click, minuscule friendly pop. Tactile and understated, no digital beep.',
  },
  {
    name: 'knock-thud',
    duration: 1,
    prompt:
      'A human fist knocks exactly once on a solid wooden card table: weighty low thump, short tabletop resonance, tiny nearby poker-chip rattle. Decisive, not violent.',
  },
  {
    name: 'life-chip-loss',
    duration: 0.85,
    prompt:
      'One clay casino chip skids briefly across felt, tips over, and clinks against one other chip. Clear tactile loss token sound, compact and bittersweet.',
  },
  {
    name: 'blitz-burst',
    duration: 2.1,
    prompt:
      'A compact spectacular casual-game victory burst for scoring exactly 31: heavy opening impact, rapid fan of playing cards, warm brass rise, bright coin sparkles, decisive final hit. Energetic and charming.',
  },
  {
    name: 'win-celebration',
    duration: 2.8,
    prompt:
      'Short premium casual-game match victory jingle: warm upright piano and muted brass ascending flourish, clay chips and card-fan accents, joyful final major chord. Cozy pub character, memorable but not childish.',
  },
  {
    name: 'lose-sting',
    duration: 1.8,
    prompt:
      'Short gentle card-game defeat sting: three descending warm muted piano and marimba notes, soft paper card settle at the end. Wry and good-natured, not tragic.',
  },
  {
    name: 'wild-surge',
    duration: 1.2,
    prompt:
      'A vivid multicolor Wild card activation: crisp card slap blooms into a fast prismatic magical ribbon, bright glass sparkles, compact bass finish. Playful premium game effect.',
  },
  {
    name: 'reverse-whoosh',
    duration: 0.85,
    prompt:
      'Two fast circular paperboard whooshes reverse direction around the listener, ending in a neat wooden tick. Clear reversal gesture, playful, compact, no voice.',
  },
  {
    name: 'skip-swipe',
    duration: 0.7,
    prompt:
      'A playing card makes one abrupt sideways swipe across felt, followed by a small hollow wooden pop that signals a skipped turn. Snappy and playful.',
  },
  {
    name: 'draw-stack',
    duration: 1,
    prompt:
      'Four playing cards rapidly slap onto a growing pile in an accelerating rhythm, each contact slightly heavier, ending with a short tense low impact. Clear card punishment stack.',
  },
  {
    name: 'color-select',
    duration: 0.65,
    prompt:
      'One color selection accent: tiny paper card flick followed by a single clean prismatic glass ping and a very short warm shimmer. Precise, bright, no melody.',
  },
];

const masterTargets = {
  'card-draw-stock': -22,
  'card-draw-discard': -22,
  'card-discard-flight': -24,
  'card-land-table': -22,
  'card-flip': -22,
  'deal-card': -25,
  'stock-shuffle': -22,
  'turn-ready': -24,
  'ui-press': -25,
  'knock-thud': -18,
  'life-chip-loss': -21,
  'blitz-burst': -17,
  'win-celebration': -18,
  'lose-sting': -20,
  'wild-surge': -19,
  'reverse-whoosh': -21,
  'skip-swipe': -21,
  'draw-stack': -19,
  'color-select': -22,
};

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const only = option('only')?.split(',').filter(Boolean) ?? null;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const masterOnly = process.argv.includes('--master-only');
const selected = only ? sounds.filter((sound) => only.includes(sound.name)) : sounds;

if (only && selected.length !== only.length) {
  const known = new Set(sounds.map((sound) => sound.name));
  const unknown = only.filter((name) => !known.has(name));
  throw new Error(`Unknown sound name(s): ${unknown.join(', ')}`);
}

if (dryRun) {
  for (const sound of selected) {
    console.log(`${sound.name}.mp3 (${sound.duration}s, ${masterTargets[sound.name]} LUFS)`);
  }
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!masterOnly && !apiKey) throw new Error('ELEVENLABS_API_KEY is required');

mkdirSync(ROOT, { recursive: true });
let generated = 0;
let skipped = 0;
let characterCost = 0;

for (const sound of selected) {
  const output = join(ROOT, `${sound.name}.mp3`);
  if (masterOnly) {
    if (!existsSync(output)) throw new Error(`Cannot master missing sound: ${sound.name}`);
    console.log(`master ${sound.name}`);
    master(output, output, masterTargets[sound.name]);
    continue;
  }

  if (!force && existsSync(output)) {
    console.log(`skip ${sound.name} (already exists)`);
    skipped += 1;
    continue;
  }

  console.log(`generate ${sound.name}`);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: `${STYLE} ${sound.prompt}`,
      duration_seconds: sound.duration,
      prompt_influence: 0.65,
      model_id: 'eleven_text_to_sound_v2',
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ElevenLabs ${response.status} for ${sound.name}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1_000)
    throw new Error(`ElevenLabs returned truncated audio for ${sound.name}`);

  const source = `${output}.source.mp3`;
  try {
    writeFileSync(source, audio);
    master(source, output, masterTargets[sound.name]);
  } finally {
    rmSync(source, { force: true });
  }

  generated += 1;
  characterCost += Number(response.headers.get('character-cost') ?? 0);
}

console.log(`done: ${generated} generated, ${skipped} skipped, character cost ${characterCost}`);

function master(input, output, targetLufs) {
  if (typeof targetLufs !== 'number') throw new Error(`Missing mastering target for ${output}`);
  const temporary = `${output}.master.mp3`;
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      '-af',
      `loudnorm=I=${targetLufs}:TP=-1.5:LRA=7`,
      '-ar',
      '44100',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '128k',
      temporary,
    ],
    { encoding: 'utf8' },
  );

  if (result.error) throw new Error(`ffmpeg is required to master SFX: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${output}: ${result.stderr.slice(0, 500)}`);
  }

  try {
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOICE_ID = 'CwhRBWXzGAHq8TQ4Fs17';
const VOICE_LABEL = 'Punchy American male arcade host';
const API_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'sfx', 'voice');

const lines = [
  { name: 'reverse', text: '[excited] Reverse!' },
  { name: 'skip', text: '[playful] Skip!' },
  { name: 'draw-two', text: '[excited] Draw two!' },
  { name: 'draw-four', text: '[excited] Wild draw four!' },
  { name: 'stacked', text: '[excited] Stack it up!' },
  { name: 'wild', text: '[excited] Wild! Switch it up!' },
  { name: 'red', text: '[excited] Red!' },
  { name: 'yellow', text: '[excited] Yellow!' },
  { name: 'green', text: '[excited] Green!' },
  { name: 'blue', text: '[excited] Blue!' },
  { name: 'last-card', text: '[excited] Last card!' },
];

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const only = option('only')?.split(',').filter(Boolean) ?? null;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const selected = only ? lines.filter((line) => only.includes(line.name)) : lines;

if (only && selected.length !== only.length) {
  const known = new Set(lines.map((line) => line.name));
  const unknown = only.filter((name) => !known.has(name));
  throw new Error(`Unknown voice line(s): ${unknown.join(', ')}`);
}

if (dryRun) {
  for (const line of selected) console.log(`${line.name}.mp3: ${line.text}`);
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required');

mkdirSync(ROOT, { recursive: true });
let generated = 0;
let skipped = 0;
let characterCost = 0;

for (const line of selected) {
  const output = join(ROOT, `${line.name}.mp3`);
  if (!force && existsSync(output)) {
    console.log(`skip ${line.name} (already exists)`);
    skipped += 1;
    continue;
  }

  console.log(`generate ${line.name} (${VOICE_LABEL})`);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: line.text,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.6,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ElevenLabs ${response.status} for ${line.name}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1_000) throw new Error(`ElevenLabs returned truncated audio for ${line.name}`);

  const source = `${output}.source.mp3`;
  try {
    writeFileSync(source, audio);
    master(source, output);
  } finally {
    rmSync(source, { force: true });
  }

  generated += 1;
  characterCost += Number(response.headers.get('character-cost') ?? 0);
}

console.log(`done: ${generated} generated, ${skipped} skipped, character cost ${characterCost}`);

function master(input, output) {
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
      'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=7',
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

  if (result.error) throw new Error(`ffmpeg is required to master voices: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${output}: ${result.stderr.slice(0, 500)}`);
  }

  try {
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
const TAU = Math.PI * 2;

function track(seconds) {
  return new Float64Array(Math.ceil(seconds * SAMPLE_RATE));
}

function tone(samples, start, duration, frequency, amplitude, decay = 3, kind = 'sine') {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.floor(duration * SAMPLE_RATE);
  for (let i = 0; i < count && first + i < samples.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const phase = TAU * frequency * t;
    const wave = kind === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
    const attack = Math.min(1, t / 0.008);
    samples[first + i] += wave * amplitude * attack * Math.exp((-decay * t) / duration);
  }
}

function sweep(samples, start, duration, from, to, amplitude, decay = 2) {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.floor(duration * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < count && first + i < samples.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const p = t / duration;
    phase += (TAU * (from + (to - from) * p)) / SAMPLE_RATE;
    samples[first + i] +=
      Math.sin(phase) * amplitude * Math.sin(Math.PI * p) * Math.exp(-decay * p);
  }
}

function noise(samples, start, duration, amplitude, decay, seed, smooth = 0.35) {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.floor(duration * SAMPLE_RATE);
  let state = seed >>> 0;
  let filtered = 0;
  for (let i = 0; i < count && first + i < samples.length; i += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const white = (state / 0xffff_ffff) * 2 - 1;
    filtered += (white - filtered) * smooth;
    const p = i / count;
    samples[first + i] += filtered * amplitude * Math.exp(-decay * p);
  }
}

function chord(samples, start, duration, frequencies, amplitude, decay = 2.2) {
  frequencies.forEach((frequency, index) =>
    tone(
      samples,
      start + index * 0.018,
      duration,
      frequency,
      amplitude / frequencies.length,
      decay,
    ),
  );
}

function normalize(samples, peak = 0.82) {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max === 0) return samples;
  const gain = peak / max;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  return samples;
}

function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    bytes.writeInt16LE(Math.round(sample * 32_767), 44 + i * 2);
  }
  return bytes;
}

function makeSuite() {
  const suite = {};

  suite['card-slide'] = track(0.32);
  noise(suite['card-slide'], 0, 0.3, 0.52, 3.5, 31, 0.08);
  sweep(suite['card-slide'], 0.02, 0.25, 620, 160, 0.16, 2.5);

  suite['card-snap'] = track(0.16);
  noise(suite['card-snap'], 0, 0.1, 0.75, 11, 73, 0.65);
  tone(suite['card-snap'], 0, 0.14, 185, 0.28, 9);

  suite['deal-riffle'] = track(0.82);
  for (let i = 0; i < 13; i += 1) {
    noise(suite['deal-riffle'], 0.04 + i * 0.047, 0.09, 0.35, 9, 200 + i, 0.55);
    tone(suite['deal-riffle'], 0.04 + i * 0.047, 0.08, 170 + i * 11, 0.09, 8);
  }

  suite['knock-thud'] = track(0.76);
  tone(suite['knock-thud'], 0, 0.7, 58, 0.8, 7);
  tone(suite['knock-thud'], 0, 0.5, 91, 0.42, 8);
  noise(suite['knock-thud'], 0, 0.22, 0.32, 8, 310, 0.08);

  suite['blitz-fanfare'] = track(1.65);
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) =>
    tone(suite['blitz-fanfare'], i * 0.11, 0.52, frequency, 0.42, 4, 'triangle'),
  );
  chord(suite['blitz-fanfare'], 0.52, 1.08, [523.25, 659.25, 783.99, 1046.5], 1, 2.8);
  noise(suite['blitz-fanfare'], 0.5, 0.34, 0.18, 3, 3110, 0.75);

  suite['chip-clink'] = track(0.42);
  tone(suite['chip-clink'], 0, 0.38, 1_720, 0.64, 7);
  tone(suite['chip-clink'], 0.018, 0.35, 2_310, 0.4, 9);

  suite['turn-tick'] = track(0.18);
  tone(suite['turn-tick'], 0, 0.15, 880, 0.42, 9, 'triangle');
  tone(suite['turn-tick'], 0.025, 0.12, 1_320, 0.22, 10);

  suite['ui-pop'] = track(0.2);
  sweep(suite['ui-pop'], 0, 0.18, 280, 620, 0.55, 2.8);

  suite['win-jingle'] = track(2.1);
  [
    [0, 523.25],
    [0.18, 659.25],
    [0.36, 783.99],
    [0.58, 1046.5],
  ].forEach(([start, note]) => tone(suite['win-jingle'], start, 0.6, note, 0.44, 4, 'triangle'));
  chord(suite['win-jingle'], 0.82, 1.18, [523.25, 659.25, 783.99], 0.95, 2.6);

  suite['lose-sting'] = track(1.35);
  [
    [0, 392],
    [0.2, 349.23],
    [0.4, 293.66],
    [0.62, 246.94],
  ].forEach(([start, note]) => tone(suite['lose-sting'], start, 0.62, note, 0.38, 4.5, 'triangle'));

  suite['parlour-ambience'] = track(18);
  chord(suite['parlour-ambience'], 0, 18, [110, 164.8125, 220, 329.625], 0.46, 0.08);
  noise(suite['parlour-ambience'], 0, 18, 0.055, 0, 8131, 0.018);
  for (let i = 0; i < 22; i += 1) {
    const at = 0.7 + ((i * 7.13) % 16.4);
    noise(suite['parlour-ambience'], at, 0.055, 0.13, 10, 9_000 + i, 0.8);
  }
  const fade = Math.floor(SAMPLE_RATE * 0.8);
  for (let i = 0; i < fade; i += 1) {
    const gain = Math.sin((i / fade) * (Math.PI / 2));
    suite['parlour-ambience'][i] *= gain;
    suite['parlour-ambience'][suite['parlour-ambience'].length - 1 - i] *= gain;
  }

  return suite;
}

mkdirSync(ROOT, { recursive: true });
for (const [name, samples] of Object.entries(makeSuite())) {
  writeFileSync(
    join(ROOT, `${name}.wav`),
    wav(normalize(samples, name === 'parlour-ambience' ? 0.38 : 0.82)),
  );
}

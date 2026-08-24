import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
const TAU = Math.PI * 2;

function tone(samples, frequency, amplitude) {
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] += Math.sin(TAU * frequency * (i / SAMPLE_RATE)) * amplitude;
  }
}

function noise(samples, start, duration, amplitude, seed) {
  const first = Math.floor(start * SAMPLE_RATE);
  const count = Math.floor(duration * SAMPLE_RATE);
  let state = seed >>> 0;
  let filtered = 0;
  for (let i = 0; i < count && first + i < samples.length; i += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    filtered += ((state / 0xffff_ffff) * 2 - 1 - filtered) * 0.018;
    samples[first + i] += filtered * amplitude;
  }
}

function normalize(samples, peak) {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  const gain = max === 0 ? 1 : peak / max;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
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
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32_767), 44 + i * 2);
  }
  return bytes;
}

const samples = new Float64Array(18 * SAMPLE_RATE);
for (const frequency of [110, 164.8125, 220, 329.625]) tone(samples, frequency, 0.115);
noise(samples, 0, 18, 0.055, 8_131);
for (let i = 0; i < 22; i += 1) {
  noise(samples, 0.7 + ((i * 7.13) % 16.4), 0.055, 0.13, 9_000 + i);
}

const fade = Math.floor(SAMPLE_RATE * 0.8);
for (let i = 0; i < fade; i += 1) {
  const gain = Math.sin((i / fade) * (Math.PI / 2));
  samples[i] *= gain;
  samples[samples.length - 1 - i] *= gain;
}

normalize(samples, 0.38);
mkdirSync(ROOT, { recursive: true });
writeFileSync(join(ROOT, 'parlour-ambience.wav'), wav(samples));

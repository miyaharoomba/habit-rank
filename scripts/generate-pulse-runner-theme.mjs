import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sampleRate = 44100;
const bpm = 140;
const beats = 32;
const secondsPerBeat = 60 / bpm;
const duration = beats * secondsPerBeat;
const sampleCount = Math.ceil(duration * sampleRate);
const samples = new Float32Array(sampleCount);

let noiseState = 0x5f3759df;
function noise() {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
  return (noiseState / 0xffffffff) * 2 - 1;
}

function addKick(time, gain = 0.72) {
  const start = Math.floor(time * sampleRate);
  const length = Math.floor(0.2 * sampleRate);
  let phase = 0;
  for (let i = 0; i < length && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const frequency = 52 + 105 * Math.exp(-t * 28);
    phase += (Math.PI * 2 * frequency) / sampleRate;
    samples[start + i] += Math.sin(phase) * Math.exp(-t * 18) * gain;
  }
}

function addSnare(time, gain = 0.35) {
  const start = Math.floor(time * sampleRate);
  const length = Math.floor(0.16 * sampleRate);
  for (let i = 0; i < length && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const body = Math.sin(Math.PI * 2 * 185 * t) * 0.25;
    samples[start + i] += (noise() * 0.75 + body) * Math.exp(-t * 23) * gain;
  }
}

function addHat(time, gain = 0.12) {
  const start = Math.floor(time * sampleRate);
  const length = Math.floor(0.055 * sampleRate);
  let previous = 0;
  for (let i = 0; i < length && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const value = noise();
    const highPassed = value - previous * 0.8;
    previous = value;
    samples[start + i] += highPassed * Math.exp(-t * 55) * gain;
  }
}

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function addSynth(time, length, note, gain, voice = "square") {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(length * sampleRate);
  const frequency = midiFrequency(note);
  let phase = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    phase += frequency / sampleRate;
    phase %= 1;
    const attack = Math.min(1, t / 0.012);
    const release = Math.min(1, (length - t) / 0.08);
    const envelope = attack * Math.max(0, release);
    const wave =
      voice === "triangle"
        ? 1 - 4 * Math.abs(phase - 0.5)
        : phase < 0.5
          ? 1
          : -1;
    samples[start + i] += wave * envelope * gain;
  }
}

const bassPattern = [45, 45, 48, 43, 45, 52, 48, 43];
const leadPattern = [69, 72, 76, 72, 67, 71, 74, 79, 69, 72, 76, 81, 79, 76, 72, 71];

for (let beat = 0; beat < beats; beat += 1) {
  const beatTime = beat * secondsPerBeat;
  addKick(beatTime, beat % 4 === 0 ? 0.82 : 0.62);
  if (beat % 4 === 1 || beat % 4 === 3) addSnare(beatTime);
  addSynth(beatTime, secondsPerBeat * 0.82, bassPattern[beat % bassPattern.length], 0.13, "triangle");

  for (let half = 0; half < 2; half += 1) {
    const stepTime = beatTime + half * secondsPerBeat * 0.5;
    addHat(stepTime, half === 0 ? 0.1 : 0.075);
    const leadIndex = (beat * 2 + half) % leadPattern.length;
    const octaveLift = beat >= 16 && beat < 24 ? 12 : 0;
    addSynth(
      stepTime,
      secondsPerBeat * 0.42,
      leadPattern[leadIndex] + octaveLift,
      beat < 4 ? 0.055 : 0.09,
      "square"
    );
  }
}

let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const scale = peak > 0 ? 0.88 / peak : 1;
const pcm = Buffer.alloc(sampleCount * 2);
for (let i = 0; i < sampleCount; i += 1) {
  const value = Math.max(-1, Math.min(1, samples[i] * scale));
  pcm.writeInt16LE(Math.round(value * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const output = resolve("public/audio/pulse-runner-theme.wav");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, pcm]));
console.log(`Generated ${output} (${duration.toFixed(2)}s, ${bpm} BPM)`);

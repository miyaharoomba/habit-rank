import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sampleRate = 44100;
const bpm = 140;
const beats = 192;
const secondsPerBeat = 60 / bpm;
const duration = beats * secondsPerBeat;
const sampleCount = Math.ceil(duration * sampleRate);
const left = new Float32Array(sampleCount);
const right = new Float32Array(sampleCount);

let noiseState = 0x5f3759df;
function noise() {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
  return (noiseState / 0xffffffff) * 2 - 1;
}

function mix(index, value, pan = 0) {
  if (index < 0 || index >= sampleCount) return;
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  left[index] += value * Math.cos(angle);
  right[index] += value * Math.sin(angle);
}

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function oscillator(phase, voice) {
  if (voice === "sine") return Math.sin(phase * Math.PI * 2);
  if (voice === "triangle") return 1 - 4 * Math.abs(phase - 0.5);
  if (voice === "saw") return phase * 2 - 1;
  if (voice === "pulse") return phase < 0.28 ? 1 : -1;
  return phase < 0.5 ? 1 : -1;
}

function addSynth({
  time,
  length,
  note,
  gain,
  voice = "triangle",
  pan = 0,
  attack = 0.012,
  release = 0.08,
  detune = 0,
  vibrato = 0,
}) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(length * sampleRate);
  const baseFrequency = midiFrequency(note) * 2 ** (detune / 1200);
  let phase = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const frequency = baseFrequency * (1 + Math.sin(Math.PI * 2 * 5.2 * t) * vibrato);
    phase = (phase + frequency / sampleRate) % 1;
    const attackEnvelope = Math.min(1, t / Math.max(0.001, attack));
    const releaseEnvelope = Math.min(1, (length - t) / Math.max(0.001, release));
    const envelope = attackEnvelope * Math.max(0, releaseEnvelope);
    const brightness = voice === "saw" ? 0.72 : voice === "pulse" ? 0.65 : 1;
    mix(start + i, oscillator(phase, voice) * envelope * gain * brightness, pan);
  }
}

function addKick(time, gain = 0.76) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(0.24 * sampleRate);
  let phase = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const frequency = 48 + 128 * Math.exp(-t * 30);
    phase += (Math.PI * 2 * frequency) / sampleRate;
    const click = i < sampleRate * 0.008 ? noise() * (1 - i / (sampleRate * 0.008)) * 0.12 : 0;
    mix(start + i, (Math.sin(phase) + click) * Math.exp(-t * 17) * gain);
  }
}

function addSnare(time, gain = 0.36, pan = 0) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(0.22 * sampleRate);
  let previous = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const raw = noise();
    const brightNoise = raw - previous * 0.72;
    previous = raw;
    const body = Math.sin(Math.PI * 2 * 182 * t) * 0.32;
    mix(start + i, (brightNoise * 0.7 + body) * Math.exp(-t * 20) * gain, pan);
  }
}

function addHat(time, gain = 0.1, pan = 0) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(0.065 * sampleRate);
  let previous = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const raw = noise();
    const high = raw - previous * 0.88;
    previous = raw;
    mix(start + i, high * Math.exp(-t * 62) * gain, pan);
  }
}

function addCrash(time, gain = 0.2) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(1.5 * sampleRate);
  let previous = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const raw = noise();
    const high = raw - previous * 0.76;
    previous = raw;
    const pan = Math.sin(t * 5.4) * 0.38;
    mix(start + i, high * Math.exp(-t * 2.5) * gain, pan);
  }
}

function addRiser(startBeat, lengthBeats, gain = 0.1) {
  const time = startBeat * secondsPerBeat;
  const length = lengthBeats * secondsPerBeat;
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(length * sampleRate);
  let phase = 0;
  let previous = 0;
  for (let i = 0; i < count && start + i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const position = t / length;
    phase = (phase + (160 + position * 980) / sampleRate) % 1;
    const raw = noise();
    const high = raw - previous * (0.96 - position * 0.35);
    previous = raw;
    const envelope = position ** 1.7 * Math.min(1, (length - t) / 0.08);
    mix(start + i, (oscillator(phase, "saw") * 0.28 + high * 0.72) * envelope * gain, position * 1.4 - 0.7);
  }
}

const chordRoots = [40, 36, 43, 38]; // Em, C, G, D
const chordIntervals = [0, 7, 12, 16];
const leadA = [64, 67, 71, 74, 76, 74, 71, 67, 69, 72, 76, 79, 78, 76, 72, 71];
const leadB = [71, 74, 76, 79, 83, 81, 79, 76, 72, 76, 79, 81, 79, 76, 74, 71];
const leadDark = [64, 62, 59, 55, 57, 59, 62, 66, 64, 62, 59, 57, 55, 57, 59, 62];

function sectionForBeat(beat) {
  if (beat < 16) return "intro";
  if (beat < 32) return "build";
  if (beat < 58) return "rocketA";
  if (beat < 76) return "bridge";
  if (beat < 94) return "inverted";
  if (beat < 110) return "invertedRise";
  if (beat < 128) return "buildB";
  if (beat < 158) return "rocketB";
  return "finale";
}

for (let chordBeat = 0; chordBeat < beats; chordBeat += 4) {
  const root = chordRoots[Math.floor(chordBeat / 4) % chordRoots.length];
  const section = sectionForBeat(chordBeat);
  const inverted = section === "inverted" || section === "invertedRise";
  const padGain = section === "intro" ? 0.035 : inverted ? 0.04 : 0.052;
  for (let index = 0; index < chordIntervals.length; index += 1) {
    const interval = chordIntervals[index];
    addSynth({
      time: chordBeat * secondsPerBeat,
      length: 3.9 * secondsPerBeat,
      note: root + interval + (inverted ? -12 : 12),
      gain: padGain,
      voice: index % 2 === 0 ? "triangle" : "saw",
      pan: (index - 1.5) * 0.34,
      attack: 0.18,
      release: 0.32,
      detune: index % 2 === 0 ? -4 : 4,
    });
  }
}

for (let beat = 0; beat < beats; beat += 1) {
  const section = sectionForBeat(beat);
  const time = beat * secondsPerBeat;
  const chordRoot = chordRoots[Math.floor(beat / 4) % chordRoots.length];
  const localBeat = beat % 16;
  const inverted = section === "inverted" || section === "invertedRise";
  const isDrop = section === "rocketA" || section === "rocketB" || section === "finale";
  const isQuiet = section === "intro" || section === "inverted";

  if (section === "intro") {
    if (beat % 4 === 0) addKick(time, 0.52);
  } else if (section === "inverted") {
    if (beat % 4 === 0) addKick(time, 0.68);
    if (beat % 4 === 2) addSnare(time, 0.32);
  } else if (section === "invertedRise") {
    addKick(time, beat % 4 === 0 ? 0.8 : 0.56);
    if (beat % 2 === 1) addSnare(time, 0.37, beat % 4 === 1 ? -0.18 : 0.18);
  } else {
    addKick(time, beat % 4 === 0 ? 0.83 : isDrop ? 0.67 : 0.58);
    if (beat % 4 === 1 || beat % 4 === 3) addSnare(time, isDrop ? 0.42 : 0.34);
    if (isDrop && beat % 8 === 7) {
      addSnare(time + secondsPerBeat * 0.5, 0.28, -0.28);
      addSnare(time + secondsPerBeat * 0.75, 0.24, 0.3);
    }
  }

  const bassNote = chordRoot + (localBeat % 4 === 3 ? 7 : 0);
  addSynth({
    time,
    length: secondsPerBeat * (isDrop ? 0.78 : 0.9),
    note: bassNote,
    gain: isQuiet ? 0.105 : 0.15,
    voice: "triangle",
    attack: 0.008,
    release: 0.1,
  });
  if (isDrop) {
    addSynth({
      time,
      length: secondsPerBeat * 0.45,
      note: bassNote + 12,
      gain: 0.045,
      voice: "saw",
      attack: 0.006,
      release: 0.08,
    });
  }

  const subdivisions = isDrop ? 4 : section === "intro" ? 2 : 2;
  for (let step = 0; step < subdivisions; step += 1) {
    const fraction = step / subdivisions;
    const stepTime = time + fraction * secondsPerBeat;
    const pan = step % 2 === 0 ? -0.42 : 0.42;
    if (!isQuiet || step % 2 === 0) addHat(stepTime, isDrop ? 0.085 : 0.07, pan);

    const arpIntervals = inverted ? [0, 3, 7, 10] : [0, 7, 12, 16];
    const arpNote = chordRoot + 24 + arpIntervals[(beat * subdivisions + step) % 4];
    addSynth({
      time: stepTime,
      length: secondsPerBeat * (isDrop ? 0.19 : 0.34),
      note: arpNote,
      gain: section === "intro" ? 0.055 : isDrop ? 0.065 : 0.045,
      voice: isDrop ? "pulse" : "triangle",
      pan,
      attack: 0.004,
      release: 0.055,
    });
  }

  if (beat >= 8) {
    const motif = inverted ? leadDark : section === "bridge" || section === "buildB" ? leadB : leadA;
    for (let half = 0; half < 2; half += 1) {
      if (section === "intro" && (beat < 8 || half === 1)) continue;
      const motifIndex = (beat * 2 + half) % motif.length;
      const lift = section === "rocketB" || section === "finale" ? 12 : 0;
      const note = motif[motifIndex] + lift;
      const noteTime = time + half * secondsPerBeat * 0.5;
      addSynth({
        time: noteTime,
        length: secondsPerBeat * (isDrop ? 0.43 : 0.38),
        note,
        gain: section === "inverted" ? 0.06 : section === "invertedRise" ? 0.082 : isDrop ? 0.105 : 0.075,
        voice: inverted ? "triangle" : "square",
        pan: half === 0 ? -0.12 : 0.12,
        attack: 0.01,
        release: 0.075,
        vibrato: isDrop ? 0.002 : 0.001,
      });
      if (isDrop && half === 0) {
        addSynth({
          time: noteTime + secondsPerBeat * 0.375,
          length: secondsPerBeat * 0.3,
          note: note - 12,
          gain: 0.028,
          voice: "triangle",
          pan: 0.55,
          attack: 0.01,
          release: 0.08,
        });
      }
    }
  }
}

for (const transition of [16, 32, 58, 76, 94, 110, 128, 158]) {
  addRiser(transition - 4, 4, transition === 128 ? 0.14 : 0.1);
  addCrash(transition * secondsPerBeat, transition === 128 || transition === 158 ? 0.27 : 0.2);
}

// Final four beats resolve upward instead of dropping into a short loop.
for (let step = 0; step < 16; step += 1) {
  addSynth({
    time: (188 + step / 4) * secondsPerBeat,
    length: secondsPerBeat * 0.2,
    note: [76, 79, 83, 88][step % 4],
    gain: 0.085 * (1 - step / 24),
    voice: "pulse",
    pan: step % 2 === 0 ? -0.5 : 0.5,
    attack: 0.003,
    release: 0.06,
  });
}

let peak = 0;
for (let i = 0; i < sampleCount; i += 1) {
  left[i] = Math.tanh(left[i] * 1.18);
  right[i] = Math.tanh(right[i] * 1.18);
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const scale = peak > 0 ? 0.92 / peak : 1;
const fadeSamples = Math.floor(sampleRate * 0.35);
const pcm = Buffer.alloc(sampleCount * 4);
for (let i = 0; i < sampleCount; i += 1) {
  const fadeIn = Math.min(1, i / fadeSamples);
  const fadeOut = Math.min(1, (sampleCount - i - 1) / fadeSamples);
  const fade = Math.max(0, Math.min(fadeIn, fadeOut));
  const leftValue = Math.max(-1, Math.min(1, left[i] * scale * fade));
  const rightValue = Math.max(-1, Math.min(1, right[i] * scale * fade));
  pcm.writeInt16LE(Math.round(leftValue * 32767), i * 4);
  pcm.writeInt16LE(Math.round(rightValue * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const output = resolve("public/audio/pulse-runner-theme.wav");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, pcm]));
console.log(
  `Generated ${output} (${duration.toFixed(2)}s, ${beats} beats, ${bpm} BPM, stereo)`
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BEAT_MS, LEVEL_BEATS } from "../app/games/pulse-runner/level.ts";

const audioPath = new URL("../public/audio/pulse-runner-theme.wav", import.meta.url);

test("Pulse Runner theme is a full-course stereo WAV", () => {
  const wav = readFileSync(audioPath);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(34), 16);

  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const dataBytes = wav.readUInt32LE(40);
  const frames = dataBytes / (channels * 2);
  const durationSeconds = frames / sampleRate;
  const expectedSeconds = (LEVEL_BEATS * BEAT_MS) / 1000;
  assert.ok(Math.abs(durationSeconds - expectedSeconds) < 0.02);
  assert.ok(durationSeconds > 70, "theme must span the full long course");
});

test("Pulse Runner theme has stereo movement and audible energy in every section", () => {
  const wav = readFileSync(audioPath);
  const dataBytes = wav.readUInt32LE(40);
  const frameCount = dataBytes / 4;
  const sectionRanges = [0, 16, 32, 58, 76, 94, 110, 128, 158, 192];
  const energy = Array(sectionRanges.length - 1).fill(0);
  const samples = Array(sectionRanges.length - 1).fill(0);
  let peak = 0;
  let stereoDifference = 0;

  for (let frame = 0; frame < frameCount; frame += 16) {
    const offset = 44 + frame * 4;
    const left = wav.readInt16LE(offset);
    const right = wav.readInt16LE(offset + 2);
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    stereoDifference += Math.abs(left - right);
    const beat = (frame / frameCount) * LEVEL_BEATS;
    const section = sectionRanges.findIndex(
      (start, index) => index < sectionRanges.length - 1 && beat >= start && beat < sectionRanges[index + 1]
    );
    if (section >= 0) {
      energy[section] += left ** 2 + right ** 2;
      samples[section] += 2;
    }
  }

  const sectionRms = energy.map((sum, index) => Math.sqrt(sum / samples[index]));
  assert.ok(sectionRms.every((rms) => rms > 900), `silent section detected: ${sectionRms}`);
  assert.ok(stereoDifference / (frameCount / 16) > 500, "theme must contain stereo movement");
  assert.ok(peak > 26000 && peak < 32767, `unexpected master peak: ${peak}`);
});

"use strict";

// Build a compact waveform envelope and a standard PCM 16-bit browser copy without
// modifying the uploaded 24-bit WAVE_FORMAT_EXTENSIBLE source.
// Usage: node scripts/generate-section-music-waveform.js

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const inputPath = path.join(
  projectRoot,
  "music",
  "Clean Bandit - Rockabye (Lyrics) feat. Sean Paul & Anne-Marie.wav"
);
const outputPath = path.join(projectRoot, "assets", "data", "section-music-waveform.json");
const outputAudioPath = path.join(projectRoot, "music", "section-music-browser-pcm16-clip-53-153.wav");
const bucketCount = 1600;
const clipStartSeconds = 53;
const clipEndSeconds = 153;
const wav = fs.readFileSync(inputPath);

if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
  throw new Error("The Section music file is not a RIFF/WAVE file.");
}

let offset = 12;
let format = null;
let dataOffset = null;
let dataSize = null;
while (offset + 8 <= wav.length) {
  const chunkId = wav.toString("ascii", offset, offset + 4);
  const chunkSize = wav.readUInt32LE(offset + 4);
  const chunkStart = offset + 8;
  if (chunkId === "fmt ") {
    format = {
      tag: wav.readUInt16LE(chunkStart),
      channels: wav.readUInt16LE(chunkStart + 2),
      sampleRate: wav.readUInt32LE(chunkStart + 4),
      blockAlign: wav.readUInt16LE(chunkStart + 12),
      bitsPerSample: wav.readUInt16LE(chunkStart + 14)
    };
  } else if (chunkId === "data") {
    dataOffset = chunkStart;
    dataSize = Math.min(chunkSize, wav.length - chunkStart);
    break;
  }
  offset = chunkStart + chunkSize + (chunkSize % 2);
}

if (!format || dataOffset == null || dataSize == null) {
  throw new Error("The WAV is missing its format or data chunk.");
}
if (format.bitsPerSample !== 24 || format.blockAlign !== format.channels * 3) {
  throw new Error("Expected interleaved 24-bit PCM audio.");
}

const sourceFrameCount = Math.floor(dataSize / format.blockAlign);
const clipStartFrame = Math.round(clipStartSeconds * format.sampleRate);
const clipEndFrame = Math.min(sourceFrameCount, Math.round(clipEndSeconds * format.sampleRate));
const frameCount = clipEndFrame - clipStartFrame;
if (frameCount <= 0) throw new Error("The requested music excerpt is empty.");
const outputBlockAlign = format.channels * 2;
const outputDataSize = frameCount * outputBlockAlign;
const browserWav = Buffer.allocUnsafe(44 + outputDataSize);
browserWav.write("RIFF", 0, "ascii");
browserWav.writeUInt32LE(36 + outputDataSize, 4);
browserWav.write("WAVE", 8, "ascii");
browserWav.write("fmt ", 12, "ascii");
browserWav.writeUInt32LE(16, 16);
browserWav.writeUInt16LE(1, 20); // Standard PCM, unlike the source's extensible format tag.
browserWav.writeUInt16LE(format.channels, 22);
browserWav.writeUInt32LE(format.sampleRate, 24);
browserWav.writeUInt32LE(format.sampleRate * outputBlockAlign, 28);
browserWav.writeUInt16LE(outputBlockAlign, 32);
browserWav.writeUInt16LE(16, 34);
browserWav.write("data", 36, "ascii");
browserWav.writeUInt32LE(outputDataSize, 40);

const peaks = [];
for (let bucket = 0; bucket < bucketCount; bucket += 1) {
  const firstFrame = Math.floor(bucket * frameCount / bucketCount);
  const lastFrame = Math.max(firstFrame + 1, Math.floor((bucket + 1) * frameCount / bucketCount));
  let peak = 0;
  for (let frame = firstFrame; frame < lastFrame; frame += 1) {
    const sourceFrame = clipStartFrame + frame;
    const frameOffset = dataOffset + sourceFrame * format.blockAlign;
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * 3;
      let sample = wav.readUIntLE(sampleOffset, 3);
      if (sample & 0x800000) sample -= 0x1000000;
      peak = Math.max(peak, Math.abs(sample) / 0x800000);
      const pcm16 = Math.max(-32768, Math.min(32767, Math.round(sample / 256)));
      browserWav.writeInt16LE(pcm16, 44 + (frame * format.channels + channel) * 2);
    }
  }
  peaks.push(Number(peak.toFixed(5)));
}

const payload = {
  source: path.basename(inputPath),
  duration_seconds: frameCount / format.sampleRate,
  sample_rate_hz: format.sampleRate,
  channels: format.channels,
  buckets: bucketCount,
  source_start_seconds: clipStartSeconds,
  source_end_seconds: clipEndSeconds,
  peaks
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload));
fs.writeFileSync(outputAudioPath, browserWav);
process.stdout.write(`Wrote ${outputPath} (${bucketCount} peaks)\n`);
process.stdout.write(`Wrote ${outputAudioPath} (standard PCM 16-bit)\n`);

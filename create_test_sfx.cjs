// Create a minimal valid WAV file for sound effect testing
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, 'test_mcp_enhancements', 'audio', 'test_sfx.wav');

// Create a simple 0.2-second mono WAV file at 44100Hz (short sound effect)
const sampleRate = 44100;
const channels = 1;
const bitsPerSample = 16;
const duration = 0.2; // 0.2 second

const numSamples = Math.floor(sampleRate * duration);
const dataSize = numSamples * channels * (bitsPerSample / 8);
const fileSize = 44 + dataSize - 8;

// WAV file buffer
const buffer = Buffer.alloc(44 + dataSize);

// RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(fileSize, 4);
buffer.write('WAVE', 8);

// fmt chunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size
buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // ByteRate
buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32); // BlockAlign
buffer.writeUInt16LE(bitsPerSample, 34);

// data chunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// Generate a simple chirp sound (440Hz to 880Hz sweep)
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const progress = i / numSamples;
  const frequency = 440 + 440 * progress; // Frequency sweep
  const envelope = (1 - progress) * 0.8; // Decay envelope
  const sample = Math.sin(2 * Math.PI * frequency * t) * 32767 * envelope;
  buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
}

fs.writeFileSync(outputPath, buffer);
console.log('Created test SFX file:', outputPath);
console.log('File size:', buffer.length, 'bytes');

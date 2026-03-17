/**
 * Asset Generation Backend Abstraction (Tier 4 — Phase C)
 *
 * Pluggable backend system for image and audio generation.
 * Supports DALL-E 3 (images), ElevenLabs (audio), and placeholder backends.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ImageBackend = 'dalle3' | 'placeholder';
export type AudioBackend = 'elevenlabs' | 'placeholder';

export interface GenerationResult {
  success: boolean;
  output_path?: string;
  backend_used: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ImageGenerationOptions {
  description: string;
  style?: 'pixel_art' | 'hand_drawn' | 'realistic' | 'cartoon' | 'flat';
  size?: string;  // e.g., "512x512", "1024x1024"
  outputPath: string;
  transparentBackground?: boolean;
  tileable?: boolean;
}

export interface AudioGenerationOptions {
  description: string;
  durationSeconds?: number;
  outputPath: string;
  format?: 'wav' | 'ogg';
  loop?: boolean;
  bpm?: number;
  mood?: string;
}

// ─── Configuration ─────────────────────────────────────────────────────────

export function getImageBackend(): ImageBackend {
  const env = process.env.ASSET_GEN_IMAGE_BACKEND?.toLowerCase();
  if (env === 'dalle3') return 'dalle3';
  return 'placeholder';
}

export function getAudioBackend(): AudioBackend {
  const env = process.env.ASSET_GEN_AUDIO_BACKEND?.toLowerCase();
  if (env === 'elevenlabs') return 'elevenlabs';
  return 'placeholder';
}

export function getBackendStatus(): {
  image: { backend: string; api_key_set: boolean };
  audio: { backend: string; api_key_set: boolean };
} {
  return {
    image: {
      backend: getImageBackend(),
      api_key_set: !!process.env.OPENAI_API_KEY,
    },
    audio: {
      backend: getAudioBackend(),
      api_key_set: !!process.env.ELEVENLABS_API_KEY,
    },
  };
}

// ─── Image Generation ──────────────────────────────────────────────────────

export async function generateImage(options: ImageGenerationOptions): Promise<GenerationResult> {
  const backend = getImageBackend();

  // Ensure output directory exists
  const dir = dirname(options.outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  switch (backend) {
    case 'dalle3':
      return generateImageDalle3(options);
    case 'placeholder':
    default:
      return generateImagePlaceholder(options);
  }
}

async function generateImageDalle3(options: ImageGenerationOptions): Promise<GenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      backend_used: 'dalle3',
      error: 'OPENAI_API_KEY environment variable is not set',
    };
  }

  try {
    // Dynamic import axios (already a project dependency)
    const axios = (await import('axios')).default;

    // Build prompt with style and constraints
    let prompt = options.description;
    if (options.style) {
      const styleMap: Record<string, string> = {
        pixel_art: 'pixel art style, retro game aesthetic, clean pixel edges',
        hand_drawn: 'hand-drawn illustration style, sketch-like quality',
        realistic: 'photorealistic, detailed, high quality',
        cartoon: 'cartoon style, bold outlines, vibrant colors',
        flat: 'flat design, minimal shading, clean vector-like',
      };
      prompt = `${styleMap[options.style] || options.style}. ${prompt}`;
    }
    if (options.transparentBackground) {
      prompt += '. On a transparent background, no background elements.';
    }
    if (options.tileable) {
      prompt += '. Seamless tileable texture, edges match perfectly when tiled.';
    }

    // DALL-E 3 sizes: 1024x1024, 1024x1792, 1792x1024
    const size = options.size === '1024x1792' || options.size === '1792x1024' ? options.size : '1024x1024';

    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const imageData = response.data.data[0].b64_json;
    const buffer = Buffer.from(imageData, 'base64');
    writeFileSync(options.outputPath, buffer);

    return {
      success: true,
      output_path: options.outputPath,
      backend_used: 'dalle3',
      metadata: {
        revised_prompt: response.data.data[0].revised_prompt,
        size,
        model: 'dall-e-3',
      },
    };
  } catch (err: any) {
    const message = err.response?.data?.error?.message || err.message;
    return {
      success: false,
      backend_used: 'dalle3',
      error: `DALL-E 3 generation failed: ${message}`,
    };
  }
}

function generateImagePlaceholder(options: ImageGenerationOptions): GenerationResult {
  // Generate a minimal valid PNG with a colored rectangle and text label
  const width = 128;
  const height = 128;
  const png = createMinimalPng(width, height, options.description);
  writeFileSync(options.outputPath, png);

  return {
    success: true,
    output_path: options.outputPath,
    backend_used: 'placeholder',
    metadata: {
      note: 'Placeholder image — configure OPENAI_API_KEY and ASSET_GEN_IMAGE_BACKEND=dalle3 for real generation',
      width,
      height,
      description: options.description,
    },
  };
}

// ─── Audio Generation ──────────────────────────────────────────────────────

export async function generateAudio(options: AudioGenerationOptions): Promise<GenerationResult> {
  const backend = getAudioBackend();

  const dir = dirname(options.outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  switch (backend) {
    case 'elevenlabs':
      return generateAudioElevenLabs(options);
    case 'placeholder':
    default:
      return generateAudioPlaceholder(options);
  }
}

async function generateAudioElevenLabs(options: AudioGenerationOptions): Promise<GenerationResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      backend_used: 'elevenlabs',
      error: 'ELEVENLABS_API_KEY environment variable is not set',
    };
  }

  try {
    const axios = (await import('axios')).default;

    const response = await axios.post(
      'https://api.elevenlabs.io/v1/sound-generation',
      {
        text: options.description,
        duration_seconds: options.durationSeconds || 2,
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );

    writeFileSync(options.outputPath, Buffer.from(response.data));

    return {
      success: true,
      output_path: options.outputPath,
      backend_used: 'elevenlabs',
      metadata: {
        duration_seconds: options.durationSeconds || 2,
        description: options.description,
      },
    };
  } catch (err: any) {
    const message = err.response?.data
      ? Buffer.from(err.response.data).toString()
      : err.message;
    return {
      success: false,
      backend_used: 'elevenlabs',
      error: `ElevenLabs generation failed: ${message}`,
    };
  }
}

function generateAudioPlaceholder(options: AudioGenerationOptions): GenerationResult {
  // Generate a minimal WAV file with a brief sine tone
  const duration = options.durationSeconds || 1;
  const wav = createMinimalWav(duration, 440, 0.3);
  writeFileSync(options.outputPath, wav);

  return {
    success: true,
    output_path: options.outputPath,
    backend_used: 'placeholder',
    metadata: {
      note: 'Placeholder audio — configure ELEVENLABS_API_KEY and ASSET_GEN_AUDIO_BACKEND=elevenlabs for real generation',
      duration_seconds: duration,
      format: 'wav',
      description: options.description,
    },
  };
}

// ─── Minimal File Generators ───────────────────────────────────────────────

/**
 * Create a minimal valid PNG file (solid color with no text rendering)
 */
function createMinimalPng(width: number, height: number, label: string): Buffer {
  // Generate a deterministic color from the label
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) - hash + label.charCodeAt(i)) | 0;
  }
  const r = (Math.abs(hash) % 200) + 40;
  const g = (Math.abs(hash >> 8) % 200) + 40;
  const b = (Math.abs(hash >> 16) % 200) + 40;

  // Build raw pixel data (RGBA) with a simple pattern
  const rawData: number[] = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter byte: None
    for (let x = 0; x < width; x++) {
      // Simple border + solid fill pattern
      const isBorder = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const isStripe = (x + y) % 16 < 2;
      if (isBorder) {
        rawData.push(255, 255, 255, 255);
      } else if (isStripe) {
        rawData.push(Math.min(r + 40, 255), Math.min(g + 40, 255), Math.min(b + 40, 255), 255);
      } else {
        rawData.push(r, g, b, 255);
      }
    }
  }

  // Deflate the raw data (use Node.js zlib)
  const zlib = require('zlib');
  const deflated = zlib.deflateSync(Buffer.from(rawData));

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function createChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const combined = Buffer.concat([typeBuffer, data]);
    const crc = crc32(combined);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    return Buffer.concat([length, combined, crcBuffer]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', deflated),
    createChunk('IEND', iend),
  ]);
}

/**
 * Create a minimal WAV file with a sine tone
 */
function createMinimalWav(durationSeconds: number, frequency: number, volume: number): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);        // Sub-chunk size
  buffer.writeUInt16LE(1, 20);         // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate sine wave samples with fade in/out
  const fadeLength = Math.min(sampleRate * 0.05, numSamples * 0.1);
  for (let i = 0; i < numSamples; i++) {
    let amplitude = Math.sin(2 * Math.PI * frequency * i / sampleRate) * volume;

    // Fade in
    if (i < fadeLength) amplitude *= i / fadeLength;
    // Fade out
    if (i > numSamples - fadeLength) amplitude *= (numSamples - i) / fadeLength;

    const sample = Math.max(-1, Math.min(1, amplitude));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer;
}

/**
 * CRC32 implementation for PNG chunks
 */
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  _crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crc32Table[i] = c >>> 0;
  }
  return _crc32Table;
}

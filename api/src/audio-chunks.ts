import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_CHUNK_MS = 10 * 60 * 1000;
const DEFAULT_CHUNK_BITRATE = '24k';

export type AudioTranscriptionChunk = {
  index: number;
  audio: Buffer;
  filename: string;
  mimeType: string;
  durationMs: number;
  startMs: number;
  endMs: number;
};

type PrepareAudioChunksInput = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  durationMs: number;
};

export async function prepareAudioChunks({
  audio,
  filename,
  mimeType,
  durationMs
}: PrepareAudioChunksInput): Promise<AudioTranscriptionChunk[]> {
  const chunkMs = Number(process.env.AUDIO_TRANSCRIPTION_CHUNK_MS ?? DEFAULT_CHUNK_MS);
  if (!Number.isFinite(chunkMs) || chunkMs <= 0) {
    throw new Error('AUDIO_TRANSCRIPTION_CHUNK_MS must be a positive number.');
  }

  if (durationMs <= chunkMs) {
    return [
      {
        index: 0,
        audio,
        filename,
        mimeType,
        durationMs,
        startMs: 0,
        endMs: durationMs
      }
    ];
  }

  const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
  const tempRoot = await mkdtemp(join(tmpdir(), 'aviation-audio-'));
  const inputExtension = safeAudioExtension(filename, mimeType);
  const inputPath = join(tempRoot, `input-${randomUUID()}${inputExtension}`);
  const chunksDir = join(tempRoot, 'chunks');
  const outputPattern = join(chunksDir, 'chunk-%04d.m4a');

  try {
    await mkdir(chunksDir, { recursive: true });
    await writeFile(inputPath, audio);

    const chunkSeconds = Math.max(1, Math.floor(chunkMs / 1000));
    await execFileAsync(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'aac',
        '-b:a',
        process.env.AUDIO_TRANSCRIPTION_CHUNK_BITRATE ?? DEFAULT_CHUNK_BITRATE,
        '-f',
        'segment',
        '-segment_time',
        String(chunkSeconds),
        '-reset_timestamps',
        '1',
        outputPattern
      ],
      {
        maxBuffer: 1024 * 1024
      }
    );

    const chunkNames = (await readdir(chunksDir))
      .filter((name) => name.endsWith('.m4a'))
      .sort();

    if (chunkNames.length === 0) {
      throw new Error('ffmpeg did not create any audio chunks.');
    }

    return Promise.all(
      chunkNames.map(async (name, index) => {
        const startMs = index * chunkMs;
        const endMs = Math.min(durationMs, (index + 1) * chunkMs);
        return {
          index,
          audio: await readFile(join(chunksDir, name)),
          filename: name,
          mimeType: 'audio/mp4',
          durationMs: Math.max(1, endMs - startMs),
          startMs,
          endMs
        };
      })
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw Object.assign(
      new Error(
        `Unable to split the long recording into transcription chunks. Make sure ffmpeg is installed or set FFMPEG_PATH. Details: ${details}`
      ),
      {
        code: 'audio_chunking_failed',
        statusCode: 500
      }
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function safeAudioExtension(filename: string, mimeType: string): string {
  const fromName = extname(filename || '').toLowerCase();
  if (fromName && /^[.][a-z0-9]{1,8}$/.test(fromName)) {
    return fromName;
  }

  switch (mimeType) {
    case 'audio/wav':
      return '.wav';
    case 'audio/mpeg':
      return '.mp3';
    case 'audio/webm':
      return '.webm';
    case 'audio/aac':
      return '.aac';
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
    default:
      return '.m4a';
  }
}

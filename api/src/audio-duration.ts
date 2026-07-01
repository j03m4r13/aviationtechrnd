import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { parseBuffer } from 'music-metadata';

export type AudioDurationSource =
  | 'music-metadata'
  | 'ffprobe'
  | 'client-fallback';

export type AudioDurationResult = {
  durationMs: number;
  source: AudioDurationSource;
  diagnostics: string[];
};

type DetermineAudioDurationArguments = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  clientDurationMs: number;
  maxDurationMs: number;
};

function normalizeSeconds(
  seconds: unknown,
  maxDurationMs: number
): number | null {
  const numericSeconds =
    typeof seconds === 'number' ? seconds : Number(seconds);

  if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) {
    return null;
  }

  const durationMs = Math.max(1, Math.round(numericSeconds * 1000));

  if (durationMs > maxDurationMs) {
    return null;
  }

  return durationMs;
}

function normalizeClientDuration(
  durationMs: number,
  maxDurationMs: number
): number | null {
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > maxDurationMs
  ) {
    return null;
  }

  return Math.max(1, Math.round(durationMs));
}

async function probeFileWithFfprobe(filePath: string): Promise<number | null> {
  const ffprobePath = process.env.FFPROBE_PATH?.trim() || 'ffprobe';

  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      ffprobePath,
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'format=duration:stream=duration',
        '-of',
        'json',
        filePath
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('ffprobe timed out.')));
    }, 15_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() || `ffprobe exited with status ${code ?? 'unknown'}.`
            )
          );
          return;
        }

        try {
          const output = JSON.parse(stdout) as {
            format?: { duration?: string | number };
            streams?: Array<{ duration?: string | number }>;
          };

          const candidates: number[] = [];
          const formatDuration = Number(output.format?.duration);

          if (Number.isFinite(formatDuration) && formatDuration > 0) {
            candidates.push(formatDuration);
          }

          for (const stream of output.streams ?? []) {
            const streamDuration = Number(stream.duration);

            if (Number.isFinite(streamDuration) && streamDuration > 0) {
              candidates.push(streamDuration);
            }
          }

          resolve(candidates.length > 0 ? Math.max(...candidates) : null);
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Unable to parse ffprobe output.')
          );
        }
      });
    });
  });
}

async function determineWithFfprobe(
  audio: Buffer,
  filename: string
): Promise<number | null> {
  const directory = await mkdtemp(
    join(tmpdir(), 'aviation-voice-duration-')
  );

  const originalExtension = extname(filename).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,8}$/.test(originalExtension)
    ? originalExtension
    : '.m4a';
  const filePath = join(directory, `upload${safeExtension}`);

  try {
    await writeFile(filePath, audio);
    return await probeFileWithFfprobe(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function determineAudioDurationMs({
  audio,
  filename,
  mimeType,
  clientDurationMs,
  maxDurationMs
}: DetermineAudioDurationArguments): Promise<AudioDurationResult> {
  const diagnostics: string[] = [];

  try {
    const metadata = await parseBuffer(
      audio,
      {
        mimeType,
        size: audio.length,
        path: filename
      },
      {
        duration: true,
        skipCovers: true
      }
    );

    const durationMs = normalizeSeconds(
      metadata.format.duration,
      maxDurationMs
    );

    if (durationMs !== null) {
      return {
        durationMs,
        source: 'music-metadata',
        diagnostics
      };
    }

    diagnostics.push('music-metadata returned no usable duration.');
  } catch (error) {
    diagnostics.push(
      `music-metadata failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }

  try {
    const ffprobeSeconds = await determineWithFfprobe(audio, filename);
    const durationMs = normalizeSeconds(ffprobeSeconds, maxDurationMs);

    if (durationMs !== null) {
      return {
        durationMs,
        source: 'ffprobe',
        diagnostics
      };
    }

    diagnostics.push('ffprobe returned no usable duration.');
  } catch (error) {
    diagnostics.push(
      `ffprobe failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }

  const allowClientFallback =
    process.env.ALLOW_CLIENT_DURATION_FALLBACK !== 'false';
  const fallbackDurationMs = normalizeClientDuration(
    clientDurationMs,
    maxDurationMs
  );

  if (allowClientFallback && fallbackDurationMs !== null) {
    diagnostics.push('Using validated client duration as a fallback.');

    return {
      durationMs: fallbackDurationMs,
      source: 'client-fallback',
      diagnostics
    };
  }

  throw Object.assign(
    new Error('The server could not determine the audio duration.'),
    {
      statusCode: 422,
      code: 'audio_duration_unavailable',
      diagnostics
    }
  );
}

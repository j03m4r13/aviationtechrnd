import OpenAI, { toFile } from 'openai';

import { enhanceAudioForTranscription, type AudioTranscriptionChunk } from './audio-chunks.js';
import { languageName } from './languages.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const transcriptionMode =
  process.env.OPENAI_TRANSCRIPTION_MODE ?? 'standard';
const standardTranscriptionModel =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';
const diarizationTranscriptionModel =
  process.env.OPENAI_DIARIZATION_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe-diarize';
const activeTranscriptionModel = isDiarizationEnabled()
  ? diarizationTranscriptionModel
  : standardTranscriptionModel;
const translationModel =
  process.env.OPENAI_TRANSLATION_MODEL ?? 'gpt-5.4-mini';

const transcriptionCostPerMinute = Number(
  process.env.TRANSCRIPTION_COST_PER_MINUTE_USD ?? '0.003'
);
const translationInputCostPerMillion = Number(
  process.env.TRANSLATION_INPUT_COST_PER_MILLION_USD ?? '0.75'
);
const translationOutputCostPerMillion = Number(
  process.env.TRANSLATION_OUTPUT_COST_PER_MILLION_USD ?? '4.50'
);

type ProcessAudioArguments = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
};

type ProcessChunkedAudioArguments = {
  chunks: AudioTranscriptionChunk[];
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
};

export type SpeakerTranscriptSegment = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  chunkIndex?: number;
};

type TranscriptionOutput = {
  text: string;
  speakerSegments: SpeakerTranscriptSegment[];
};

type DiarizedTranscriptionResponse = {
  text?: string;
  segments?: Array<{
    speaker?: string;
    start?: number;
    end?: number;
    text?: string;
  }>;
};

const aviationTranscriptionPrompt = [
  'This is aircraft cockpit and radio audio.',
  'It may contain pilot, co-pilot, passenger, tower, ground, approach, center, ATC, and other aircraft transmissions.',
  'Transcribe every audible speaker and do not focus only on the closest or loudest pilot voice.',
  'Quiet radio transmissions and background intercom voices should be transcribed when audible.',
  'Preserve speaker changes, call signs, aircraft identifiers, airport codes, runway numbers, headings, altitudes, frequencies, units, the NATO phonetic alphabet, and aviation terminology exactly.',
  'Do not invent missing words or silently guess unclear numbers.'
].join(' ');

export function isSpeakerDiarizationMode(): boolean {
  return isDiarizationEnabled();
}

export async function transcribeAndTranslate({
  audio,
  filename,
  mimeType,
  durationMs,
  sourceLanguage,
  targetLanguage
}: ProcessAudioArguments) {
  const transcription = await transcribeAudio({
    audio,
    filename,
    mimeType,
    sourceLanguage,
    chunkIndex: 0,
    chunkStartMs: 0
  });

  return translateFinalTranscript({
    transcript: transcription.text,
    speakerSegments: transcription.speakerSegments,
    durationMs,
    sourceLanguage,
    targetLanguage,
    chunkCount: 1
  });
}

export async function transcribeChunksAndTranslate({
  chunks,
  durationMs,
  sourceLanguage,
  targetLanguage
}: ProcessChunkedAudioArguments) {
  if (chunks.length === 0) {
    throw new Error('No audio chunks were provided for transcription.');
  }

  const chunkTranscripts: string[] = [];
  const speakerSegments: SpeakerTranscriptSegment[] = [];

  for (const chunk of chunks) {
    const output = await transcribeAudio({
      audio: chunk.audio,
      filename: chunk.filename,
      mimeType: chunk.mimeType,
      sourceLanguage,
      chunkIndex: chunk.index,
      chunkStartMs: chunk.startMs
    });

    if (output.text) {
      chunkTranscripts.push(output.text);
    }
    speakerSegments.push(...output.speakerSegments);
  }

  const transcript = stitchChunkTranscripts(chunkTranscripts);
  if (!transcript) {
    throw new Error('The transcription service returned empty text for all chunks.');
  }

  return translateFinalTranscript({
    transcript,
    speakerSegments,
    durationMs,
    sourceLanguage,
    targetLanguage,
    chunkCount: chunks.length
  });
}

async function transcribeAudio(input: {
  audio: Buffer;
  filename: string;
  mimeType: string;
  sourceLanguage: string;
  chunkIndex: number;
  chunkStartMs: number;
}): Promise<TranscriptionOutput> {
  return isDiarizationEnabled()
    ? transcribeAudioWithDiarization(input)
    : transcribeAudioNormally(input);
}

async function transcribeAudioNormally(input: {
  audio: Buffer;
  filename: string;
  mimeType: string;
  sourceLanguage: string;
}): Promise<TranscriptionOutput> {
  const file = await toFile(input.audio, input.filename, { type: input.mimeType });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: standardTranscriptionModel,
    response_format: 'json',
    prompt: aviationTranscriptionPrompt,
    ...(input.sourceLanguage !== 'auto' ? { language: input.sourceLanguage } : {})
  });

  return {
    text: transcription.text.trim(),
    speakerSegments: []
  };
}

async function transcribeAudioWithDiarization(input: {
  audio: Buffer;
  filename: string;
  mimeType: string;
  sourceLanguage: string;
  chunkIndex: number;
  chunkStartMs: number;
}): Promise<TranscriptionOutput> {
  const enhanced = await enhanceAudioForTranscription({
    audio: input.audio,
    filename: input.filename,
    mimeType: input.mimeType
  });
  const file = await toFile(enhanced.audio, enhanced.filename, { type: enhanced.mimeType });
  const createDiarizedTranscription = (
    client.audio.transcriptions.create as unknown as (
      request: Record<string, unknown>
    ) => Promise<unknown>
  ).bind(client.audio.transcriptions);

  const response = await createDiarizedTranscription({
    file,
    model: diarizationTranscriptionModel,
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
    ...(input.sourceLanguage !== 'auto' ? { language: input.sourceLanguage } : {})
  });

  const diarized = response as DiarizedTranscriptionResponse;
  const speakerSegments = normalizeSpeakerSegments(
    diarized.segments ?? [],
    input.chunkStartMs,
    input.chunkIndex
  );
  const labelledTranscript = formatSpeakerTranscript(speakerSegments);
  const fallbackText = (diarized.text ?? '').trim();

  return {
    text: labelledTranscript || fallbackText,
    speakerSegments
  };
}

async function translateFinalTranscript(input: {
  transcript: string;
  speakerSegments: SpeakerTranscriptSegment[];
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  chunkCount: number;
}) {
  const transcript = input.transcript.trim();
  if (!transcript) {
    throw new Error('The transcription service returned an empty transcript.');
  }

  const translation = await client.responses.create({
    model: translationModel,
    reasoning: { effort: 'low' },
    instructions: [
      'You are a precise professional translator for an aviation voice-notes application.',
      'Translate faithfully without adding commentary.',
      'Preserve call signs, airport identifiers, registrations, runway numbers, headings, altitudes, frequencies, units, and proper nouns.',
      'Preserve speaker labels and timestamps when they are present in the transcript.',
      'Do not silently guess a number or identifier that is unclear in the source.',
      'Return only the translated text.'
    ].join(' '),
    input: [
      `Source language: ${languageName(input.sourceLanguage)}.`,
      `Target language: ${languageName(input.targetLanguage)}.`,
      '',
      'Transcript:',
      transcript
    ].join('\n')
  });

  const inputTokens = translation.usage?.input_tokens ?? null;
  const outputTokens = translation.usage?.output_tokens ?? null;
  const estimatedCostUsd =
    (input.durationMs / 60_000) * transcriptionCostPerMinute +
    ((inputTokens ?? 0) / 1_000_000) * translationInputCostPerMillion +
    ((outputTokens ?? 0) / 1_000_000) * translationOutputCostPerMillion;

  return {
    transcript,
    translation: translation.output_text.trim(),
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    speakerSegments: input.speakerSegments,
    models: {
      transcription: activeTranscriptionModel,
      translation: translationModel
    },
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      chunkCount: input.chunkCount
    }
  };
}

function stitchChunkTranscripts(chunks: string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isDiarizationEnabled(): boolean {
  return (
    transcriptionMode === 'speaker_diarization' ||
    transcriptionMode === 'diarized' ||
    standardTranscriptionModel === 'gpt-4o-transcribe-diarize'
  );
}

function normalizeSpeakerSegments(
  segments: NonNullable<DiarizedTranscriptionResponse['segments']>,
  chunkStartMs: number,
  chunkIndex: number
): SpeakerTranscriptSegment[] {
  const normalized: SpeakerTranscriptSegment[] = [];

  segments.forEach((segment, index) => {
    const text = (segment.text ?? '').trim();
    if (!text) return;

    const startMs = secondsToMs(segment.start, chunkStartMs);
    const endMs = Math.max(startMs, secondsToMs(segment.end, chunkStartMs));

    normalized.push({
      speaker: normalizeSpeakerName(segment.speaker, index),
      startMs,
      endMs,
      text,
      chunkIndex
    });
  });

  return normalized;
}

function secondsToMs(value: unknown, offsetMs: number): number {
  const seconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return offsetMs;
  }
  return offsetMs + Math.round(seconds * 1000);
}

function normalizeSpeakerName(value: unknown, index: number): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return `Speaker ${index + 1}`;
  }
  if (/^speaker/i.test(raw)) {
    return raw;
  }
  return `Speaker ${raw}`;
}

function formatSpeakerTranscript(segments: SpeakerTranscriptSegment[]): string {
  return segments
    .map((segment) => `${formatTimestamp(segment.startMs)} ${segment.speaker}: ${segment.text}`)
    .join('\n')
    .trim();
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `[${hours}:${mm}:${ss}]`;
  }
  return `[${mm}:${ss}]`;
}

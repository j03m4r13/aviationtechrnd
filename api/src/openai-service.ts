import OpenAI, { toFile } from 'openai';

import type { AudioTranscriptionChunk } from './audio-chunks.js';
import { languageName } from './languages.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const transcriptionModel =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';
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

const aviationTranscriptionPrompt =
  'This is close-microphone pilot speech. Preserve call signs, aircraft identifiers, airport codes, runway numbers, headings, altitudes, frequencies, units, the NATO phonetic alphabet, and aviation terminology exactly. Do not invent missing words.';

export async function transcribeAndTranslate({
  audio,
  filename,
  mimeType,
  durationMs,
  sourceLanguage,
  targetLanguage
}: ProcessAudioArguments) {
  const transcript = await transcribeAudio({
    audio,
    filename,
    mimeType,
    sourceLanguage
  });

  return translateFinalTranscript({
    transcript,
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
  for (const chunk of chunks) {
    const text = await transcribeAudio({
      audio: chunk.audio,
      filename: chunk.filename,
      mimeType: chunk.mimeType,
      sourceLanguage
    });

    if (text) {
      chunkTranscripts.push(text);
    }
  }

  const transcript = stitchChunkTranscripts(chunkTranscripts);
  if (!transcript) {
    throw new Error('The transcription service returned empty text for all chunks.');
  }

  return translateFinalTranscript({
    transcript,
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
}): Promise<string> {
  const file = await toFile(input.audio, input.filename, { type: input.mimeType });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: transcriptionModel,
    response_format: 'json',
    prompt: aviationTranscriptionPrompt,
    ...(input.sourceLanguage !== 'auto' ? { language: input.sourceLanguage } : {})
  });

  return transcription.text.trim();
}

async function translateFinalTranscript(input: {
  transcript: string;
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
    models: {
      transcription: transcriptionModel,
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

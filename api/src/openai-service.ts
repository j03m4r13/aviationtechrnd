import OpenAI, { toFile } from 'openai';

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

export async function transcribeAndTranslate({
  audio,
  filename,
  mimeType,
  durationMs,
  sourceLanguage,
  targetLanguage
}: ProcessAudioArguments) {
  const file = await toFile(audio, filename, { type: mimeType });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: transcriptionModel,
    response_format: 'json',
    prompt:
      'This is close-microphone pilot speech. Preserve call signs, aircraft identifiers, airport codes, runway numbers, headings, altitudes, frequencies, units, the NATO phonetic alphabet, and aviation terminology exactly. Do not invent missing words.',
    ...(sourceLanguage !== 'auto' ? { language: sourceLanguage } : {})
  });

  const transcript = transcription.text.trim();
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
      `Source language: ${languageName(sourceLanguage)}.`,
      `Target language: ${languageName(targetLanguage)}.`,
      '',
      'Transcript:',
      transcript
    ].join('\n')
  });

  const inputTokens = translation.usage?.input_tokens ?? null;
  const outputTokens = translation.usage?.output_tokens ?? null;
  const estimatedCostUsd =
    (durationMs / 60_000) * transcriptionCostPerMinute +
    ((inputTokens ?? 0) / 1_000_000) * translationInputCostPerMillion +
    ((outputTokens ?? 0) / 1_000_000) * translationOutputCostPerMillion;

  return {
    transcript,
    translation: translation.output_text.trim(),
    sourceLanguage,
    targetLanguage,
    models: {
      transcription: transcriptionModel,
      translation: translationModel
    },
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
    }
  };
}

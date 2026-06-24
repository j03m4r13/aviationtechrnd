import OpenAI, { toFile } from 'openai';
import { languageName } from './languages.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const transcriptionModel =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';

const translationModel =
  process.env.OPENAI_TRANSLATION_MODEL ?? 'gpt-5.4-mini';

type ProcessAudioArguments = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export async function transcribeAndTranslate({
  audio,
  filename,
  mimeType,
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

  return {
    transcript,
    translation: translation.output_text.trim(),
    sourceLanguage,
    targetLanguage,
    models: {
      transcription: transcriptionModel,
      translation: translationModel
    }
  };
}

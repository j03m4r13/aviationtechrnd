export type LanguageOption = {
  code: string;
  label: string;
};

export type ProcessingResult = {
  transcript: string;
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  models: {
    transcription: string;
    translation: string;
  };
};

export type ProcessingState =
  | 'idle'
  | 'recording'
  | 'recorded'
  | 'uploading'
  | 'completed'
  | 'error';

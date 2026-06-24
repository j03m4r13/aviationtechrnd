const LANGUAGE_NAMES: Record<string, string> = {
  auto: 'automatically detected language',
  en: 'English',
  tl: 'Tagalog/Filipino',
  es: 'Spanish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese'
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

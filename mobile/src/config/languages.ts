import type { LanguageOption } from '../types/audio';

export const SOURCE_LANGUAGES: LanguageOption[] = [
  { code: 'auto', label: 'Auto detect' },
  { code: 'en', label: 'English' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'zh', label: 'Chinese' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' }
];

export const TARGET_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'zh', label: 'Chinese' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' }
];

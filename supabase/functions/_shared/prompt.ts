// What every prompt to the model shares: the app's languages, which answers are in, and how text
// the user wrote goes into a prompt.

/** The app's languages, which Bite answers in. */
export const LANGUAGES = ['en', 'de', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Each language as the model is told it. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'German',
  tr: 'Turkish',
};

/**
 * Text the user wrote, as it goes into the prompt: every `<`, in any form, gives way to `‹`, so
 * that nothing in it can pass for the start or end of a snapshot or a message.
 */
export function untagged(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replaceAll('<', '‹');
}

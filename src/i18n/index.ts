import { vi, type MessageKey } from './vi';

export type { MessageKey };
export type Locale = 'vi';

const messages: Record<Locale, Record<MessageKey, string>> = { vi };

let current: Locale = 'vi';

export function setLocale(locale: Locale): void {
  current = locale;
}

/** Looks up a UI string and fills `{name}` placeholders. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template: string = messages[current][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Every UI string, for loading the font subsets a canvas is about to draw with. */
export function allText(): string {
  return Object.values(messages[current]).join('');
}

import en from './en';
import tl from './tl';
import bcl from './bcl';

type LocaleTable = typeof en;

const locales: Record<string, LocaleTable> = {
  en,
  tl,
  fil: tl,
  bcl,
  bik: bcl,
};

let activeLocale: string | null = null;

const normalizeLocale = (locale?: string) => {
  if (!locale) return 'en';
  const lower = locale.toLowerCase();
  if (lower.startsWith('tl') || lower.startsWith('fil')) return 'tl';
  if (lower.startsWith('bcl') || lower.startsWith('bik')) return 'bcl';
  return 'en';
};

const getDeviceLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
};

export const setLocale = (locale: string) => {
  activeLocale = locale;
};

const resolveTable = () => {
  const normalized = normalizeLocale(activeLocale || getDeviceLocale());
  return locales[normalized] || en;
};

const lookup = (table: LocaleTable, key: string) => {
  return key.split('.').reduce<Record<string, unknown> | undefined>(
    (acc, part) => {
      if (!acc || typeof acc !== 'object') return undefined;
      return acc[part] as Record<string, unknown> | undefined;
    },
    table as unknown as Record<string, unknown>,
  );
};

export const t = (key: string, params?: Record<string, string>) => {
  const table = resolveTable();
  const fallbackValue = lookup(en, key);
  const raw = lookup(table, key) ?? fallbackValue;

  if (typeof raw !== 'string') {
    return key;
  }

  if (!params) return raw;

  return Object.keys(params).reduce((value, paramKey) => {
    return value.replace(new RegExp(`{{${paramKey}}}`, 'g'), params[paramKey]);
  }, raw);
};

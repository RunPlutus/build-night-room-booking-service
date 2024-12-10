import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';

export type Locale = 'en' | 'de' | 'fr';
const catalogs: Record<Locale, Record<string, string>> = { en, de, fr };

export function t(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const tpl = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

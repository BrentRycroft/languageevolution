/**
 * Lightweight i18n scaffold.
 *
 * The audit (Phase 19 plan C8) flagged that all UI strings are hard-coded
 * English with no infrastructure for translations. Rather than introduce a
 * heavy framework (react-i18next etc.) prematurely, this module provides:
 *
 *   - A flat catalog keyed by string id, with the `en` catalog as the
 *     baseline and only source of truth.
 *   - A `t(key, params?)` lookup function that interpolates `{name}`-style
 *     placeholders.
 *   - Pluggable `setLocale(name)` for future translations: when a locale
 *     other than `en` is registered, `t()` falls back to `en` for any
 *     missing key.
 *
 * Components don't have to migrate today. The catalog grows as new strings
 * are added; existing JSX with literal strings still works. The scaffold
 * exists so the next time a translation request comes in, the move is
 * additive rather than a refactor.
 */

export type Locale = "en";

/** Baseline catalog. Any new translation must implement these keys. */
const EN_CATALOG: Record<string, string> = {
  // Onboarding tour
  "onboarding.welcome": "Welcome to the language evolution simulator",
  "onboarding.next": "next →",
  "onboarding.back": "← back",
  "onboarding.start": "get started",
  "onboarding.dismiss": "Dismiss welcome tour",
  // Generic
  "common.copy": "Copy",
  "common.export": "Export",
  "common.import": "Import",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading…",
  // Tabs (mirrored from tabs.ts; can diverge for translations later)
  "tab.tree": "Tree",
  "tab.map": "Map",
  "tab.dictionary": "Dictionary",
  "tab.timeline": "Timeline",
  "tab.grammar": "Grammar",
  "tab.phonemes": "Phonemes",
  "tab.laws": "Sound laws",
  "tab.events": "History",
  "tab.translate": "Translate",
  "tab.compare": "Compare",
  "tab.cognates": "Cognates",
  "tab.sandbox": "Sandbox",
  "tab.stats": "Stats",
  "tab.glossary": "Glossary",
};

const CATALOGS: Record<Locale, Record<string, string>> = {
  en: EN_CATALOG,
};

let activeLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

/**
 * Translate a key. Substitutes `{name}` placeholders from `params`. Falls
 * back to the en catalog if the active locale is missing the key, then to
 * the key string itself.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const localized = CATALOGS[activeLocale]?.[key];
  const fallback = CATALOGS.en[key];
  let raw = localized ?? fallback ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.replaceAll(`{${k}}`, String(v));
    }
  }
  return raw;
}

/** Test/export hook to introspect the catalog (used by tests). */
export function listKeys(locale: Locale = "en"): string[] {
  return Object.keys(CATALOGS[locale] ?? {});
}

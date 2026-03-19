import { useState, useEffect } from 'react';
import { translations, Language, TranslationKey } from '../utils/translations';

export function useLanguage() {
  const [language, setLanguageState] = useState<Language | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('preferred_language') as Language | null;
    if (stored === 'en' || stored === 'si') {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    localStorage.setItem('preferred_language', lang);
    setLanguageState(lang);
  };

  const t = (key: TranslationKey): string => {
    // If language is null, default to English text to prevent undefined errors before hydration
    const activeLang = language || 'en';
    return translations[activeLang][key] || translations['en'][key];
  };

  return { language, setLanguage, t };
}

import { createI18n } from 'vue-i18n';
import pt from './pt.json';
import en from './en.json';

const supportedLocales = ['pt', 'en'];

const getDefaultLocale = () => {
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith('en')) return 'en';
  return 'pt';
};

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    pt,
    en,
  },
});

export { supportedLocales };
export default i18n;

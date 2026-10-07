import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

// English first; French-ready (brief §9.15). Add fr.json and list it here.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n

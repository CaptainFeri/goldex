import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fa from './locales/fa.json'

function applyLang(lng) {
  document.documentElement.setAttribute('lang', lng)
  document.documentElement.setAttribute('dir', lng === 'fa' ? 'rtl' : 'ltr')
  localStorage.setItem('lang', lng)
}

const saved = localStorage.getItem('lang') || 'fa'
applyLang(saved)

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fa: { translation: fa } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', applyLang)

export default i18n

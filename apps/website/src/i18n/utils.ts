import { getRelativeLocaleUrl } from "astro:i18n";
import { i18n } from "astro:config/client";
import { defaultLang, ui } from "./ui";

export type Lang = keyof typeof ui;

export function getLang(locale: string | undefined): Lang {
  return locale && locale in ui ? (locale as Lang) : defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

function pathWithoutLocale(pathname: string) {
  const defaultLocale = i18n?.defaultLocale ?? defaultLang;
  let path = pathname;
  for (const locale of i18n?.locales ?? []) {
    if (typeof locale !== "string" || locale === defaultLocale) continue;
    if (path === `/${locale}` || path.startsWith(`/${locale}/`)) {
      path = path.slice(locale.length + 1) || "/";
      break;
    }
  }
  return path.replace(/^\/|\/$/g, "");
}

export function getPathWithoutLocale(url: URL) {
  return pathWithoutLocale(url.pathname);
}

export function getLocalizedPath(url: URL, locale: string) {
  return getRelativeLocaleUrl(locale, pathWithoutLocale(url.pathname));
}

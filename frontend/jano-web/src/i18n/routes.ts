/**
 * Rutas de la landing por idioma. Es la única fuente para enlaces internos,
 * canónicas, alternativas hreflang, el selector de idioma y el sitemap
 * (astro.config.mjs la importa). Todas acaban en barra, como las sirve el
 * build estático en formato directorio.
 */
export const locales = ["es", "en"] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = "es";

export const routes = {
  home: { es: "/", en: "/en/" },
  privacy: { es: "/legal/privacidad/", en: "/en/legal/privacy/" },
  terms: { es: "/legal/terminos/", en: "/en/legal/terms/" },
  cookies: { es: "/legal/cookies/", en: "/en/legal/cookies/" },
  notice: { es: "/legal/aviso-legal/", en: "/en/legal/legal-notice/" },
} as const satisfies Record<string, Record<Lang, string>>;

export type RouteKey = keyof typeof routes;
export type LegalKey = Exclude<RouteKey, "home">;

/** Etiqueta BCP 47 de cada idioma para hreflang y el sitemap. */
export const hreflang: Record<Lang, string> = { es: "es-ES", en: "en" };

/** Locale de Open Graph. */
export const ogLocale: Record<Lang, string> = { es: "es_ES", en: "en_GB" };

export function pathFor(key: RouteKey, lang: Lang): string {
  return routes[key][lang];
}

/** Busca la ruta lógica a partir de un pathname servido (con o sin barra final). */
export function routeForPath(pathname: string): { key: RouteKey; lang: Lang } | undefined {
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  for (const key of Object.keys(routes) as RouteKey[]) {
    for (const lang of locales) {
      if (routes[key][lang] === normalized) return { key, lang };
    }
  }
  return undefined;
}

import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { hreflang, locales, routeForPath, routes } from "./src/i18n/routes.ts";

// Dominio de producción (ADR-001). Amplify puede sobrescribirlo con
// PUBLIC_SITE_URL; canónicas, hreflang, Open Graph, sitemap y robots lo usan.
const site = process.env.PUBLIC_SITE_URL || "https://jano.tekhos.com";

export default defineConfig({
  site,
  output: "static",
  // Rutas legales anteriores: la de privacidad y la de términos están
  // publicadas en la pantalla de consentimiento de Google y no pueden romperse.
  redirects: {
    "/privacidad": "/legal/privacidad/",
    "/terminos": "/legal/terminos/",
    "/aviso-legal": "/legal/aviso-legal/",
  },
  i18n: {
    defaultLocale: "es",
    locales: [...locales],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      // Las rutas legales no comparten slug entre idiomas, así que las
      // alternativas se calculan con la tabla de rutas y no por prefijo.
      serialize(item) {
        const match = routeForPath(new URL(item.url).pathname);
        if (!match) return item;
        const alternates = locales.map((lang) => ({
          lang: hreflang[lang],
          url: new URL(routes[match.key][lang], site).toString(),
        }));
        return {
          ...item,
          links: [...alternates, { lang: "x-default", url: new URL(routes[match.key].es, site).toString() }],
        };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

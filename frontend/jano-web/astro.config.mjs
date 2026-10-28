import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// `site` es placeholder hasta fijar el dominio (ADR-001). Sitemap y
// canónicas lo usan; Amplify lo sobrescribe vía PUBLIC_SITE_URL.
const site = process.env.PUBLIC_SITE_URL ?? "https://jano.example";

export default defineConfig({
  site,
  output: "static",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});

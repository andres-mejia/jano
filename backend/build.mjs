// Empaqueta la Lambda de la API en un solo módulo ESM. El SDK v3 de AWS ya viene en
// el runtime de Node 22, así que queda fuera del paquete.
import { build } from "esbuild";

await build({
  entryPoints: ["src/entrypoints/api.ts"],
  outfile: "dist/api/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["@aws-sdk/*"],
  sourcemap: false,
  legalComments: "none",
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

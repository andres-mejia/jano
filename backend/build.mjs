// Empaqueta las Lambdas (API, motor de ADR-003 y trabajador de cuentas) en un módulo
// ESM cada una. El SDK v3 de AWS ya viene en el runtime de Node 22, así que queda
// fuera del paquete.
import { build } from "esbuild";

for (const nombre of ["api", "motor", "cuentas"]) {
  await build({
    entryPoints: [`src/entrypoints/${nombre}.ts`],
    outfile: `dist/${nombre}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    external: ["@aws-sdk/*"],
    sourcemap: false,
    legalComments: "none",
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
}

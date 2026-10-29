// Empaqueta las Lambdas (API, motor de ADR-003 y trabajador de cuentas) en un módulo
// ESM cada una. El SDK v3 de AWS ya viene en el runtime de Node 22, así que queda
// fuera del paquete. Los prompts versionados de los agentes (spec 008 FR-011) se
// copian junto a cada index.mjs: los lee `adapters/bedrock/prompts.ts` en `./prompts/`.
import { cp, rm } from "node:fs/promises";

import { build } from "esbuild";

for (const nombre of ["api", "motor", "cuentas"]) {
  await rm(`dist/${nombre}`, { recursive: true, force: true });
  await build({
    entryPoints: [`src/entrypoints/${nombre}.ts`],
    outfile: `dist/${nombre}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // canvas: dependencia opcional de linkedom que el lector web no usa.
    external: ["@aws-sdk/*", "canvas"],
    sourcemap: false,
    legalComments: "none",
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
  await cp("src/adapters/bedrock/prompts", `dist/${nombre}/prompts`, { recursive: true });
}

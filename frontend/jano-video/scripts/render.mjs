// Renderiza el vídeo promocional en los idiomas pedidos (por defecto, es y en) y deja
// mp4 (H.264) y webm (VP9), sin audio, en la carpeta pública de la landing.
// Uso: node scripts/render.mjs es en
// Variables opcionales: BROWSER_EXECUTABLE (Chrome headless propio), CRF_H264, CRF_VP9.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
const publicDir = join(root, "..", "jano-web", "public", "media");
const langs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["es", "en"];

// Con estos valores cada fichero queda entre 1,5 y 1,7 MB, lejos del tope de 6 MB para la landing.
const crf = { h264: process.env.CRF_H264 ?? "20", vp9: process.env.CRF_VP9 ?? "33" };
const formats = [
  { ext: "mp4", codec: "h264", extra: ["--pixel-format=yuv420p"] },
  { ext: "webm", codec: "vp9", extra: [] },
];

mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

for (const lang of langs) {
  if (lang !== "es" && lang !== "en") throw new Error(`Idioma no soportado: ${lang}`);
  for (const f of formats) {
    const file = join(outDir, `jano-demo-${lang}.${f.ext}`);
    const args = [
      "exec",
      "remotion",
      "render",
      "src/index.ts",
      "JanoDemo",
      file,
      `--props=${JSON.stringify({ lang })}`,
      `--codec=${f.codec}`,
      `--crf=${crf[f.codec]}`,
      "--muted",
      ...f.extra,
    ];
    if (process.env.BROWSER_EXECUTABLE) args.push(`--browser-executable=${process.env.BROWSER_EXECUTABLE}`);
    const res = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
    if (res.status !== 0) process.exit(res.status ?? 1);
    copyFileSync(file, join(publicDir, `jano-demo-${lang}.${f.ext}`));
  }
}

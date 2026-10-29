// Fotogramas fijos.
//   node scripts/still.mjs                 -> pósteres es y en (webp, 1600 px) en la landing
//   node scripts/still.mjs es 300 [400 …]  -> PNG de esos fotogramas en out/ (revisión)
// Variable opcional: BROWSER_EXECUTABLE (Chrome headless propio).
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Fotograma del póster: tarjeta de aprobación con el borrador de la IA y el puntero llegando. */
const POSTER_FRAME = 553;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
const publicDir = join(root, "..", "jano-web", "public", "media");
mkdirSync(outDir, { recursive: true });

const still = (lang, frame, file) => {
  const args = [
    "exec",
    "remotion",
    "still",
    "src/index.ts",
    "JanoDemo",
    file,
    `--props=${JSON.stringify({ lang })}`,
    `--frame=${frame}`,
  ];
  if (process.env.BROWSER_EXECUTABLE) args.push(`--browser-executable=${process.env.BROWSER_EXECUTABLE}`);
  const res = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

const [lang, ...frames] = process.argv.slice(2);
if (lang) {
  for (const frame of frames) still(lang, Number(frame), join(outDir, `still-${lang}-${frame}.png`));
} else {
  mkdirSync(publicDir, { recursive: true });
  for (const l of ["es", "en"]) {
    const png = join(outDir, `poster-${l}.png`);
    still(l, POSTER_FRAME, png);
    const webp = join(publicDir, `jano-demo-${l}.webp`);
    const py = [
      "import sys",
      "from PIL import Image",
      "im = Image.open(sys.argv[1]).convert('RGB')",
      "w = 1600",
      "im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)",
      "im.save(sys.argv[2], 'WEBP', quality=82, method=6)",
    ].join("\n");
    const res = spawnSync("python3", ["-I", "-c", py, png, webp], { stdio: "inherit" });
    if (res.status !== 0) process.exit(res.status ?? 1);
  }
}

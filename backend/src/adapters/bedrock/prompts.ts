import { readFileSync } from "node:fs";

/**
 * Prompts versionados en el repo (spec 008 FR-011): `prompts/<nombre>.md`, en
 * español. La primera línea lleva la versión (`# Título · v1`), que va en el log de
 * cada llamada. Todos empiezan por `comun.md`, con las reglas que comparten los
 * agentes. Al empaquetar, `build.mjs` copia la carpeta junto a cada Lambda.
 */

export interface Prompt {
  readonly nombre: string;
  /** `v<propio>+comun.v<comun>`, para el log. */
  readonly version: string;
  readonly texto: string;
}

const DIR = new URL("./prompts/", import.meta.url);
const leidos = new Map<string, Prompt>();

function leer(nombre: string): { version: number; texto: string } {
  const texto = readFileSync(new URL(`${nombre}.md`, DIR), "utf8").trim();
  const version = Number(/·\s*v(\d+)/.exec(texto.split("\n")[0] ?? "")?.[1]);
  if (!Number.isInteger(version)) throw new Error(`prompt ${nombre} sin versión en la primera línea`);
  return { version, texto };
}

export function prompt(nombre: string): Prompt {
  const ya = leidos.get(nombre);
  if (ya) return ya;
  const comun = leer("comun");
  const propio = leer(nombre);
  const p = { nombre, version: `v${propio.version}+comun.v${comun.version}`, texto: `${comun.texto}\n\n${propio.texto}` };
  leidos.set(nombre, p);
  return p;
}

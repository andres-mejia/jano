import { en } from "./en";
import { es } from "./es";
import type { Lang } from "./routes";
import type { Dict } from "./types";

const dicts: Record<Lang, Dict> = { es, en };

export function t(lang: Lang): Dict {
  return dicts[lang];
}

export * from "./routes";
export type { Dict } from "./types";

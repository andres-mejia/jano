import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

/** Tokens de marca de Jano (`--color-jano-*`). Ningún color fuera de esta tabla. */
export const color = {
  tinta: "#14162b",
  tinta2: "#23264a",
  cobalto: "#4338d6",
  cobaltoOscuro: "#2e25a8",
  cobaltoClaro: "#7b73f0",
  cobaltoTinte: "#ecebfc",
  bronce: "#e39a2e",
  bronceTinte: "#fbf0dd",
  niebla: "#ecedf4",
  papel: "#ffffff",
  linea: "#e1e3ee",
  muted: "#5b6078",
  verde: "#1b7f5c",
} as const;

const subsets: ("latin" | "latin-ext")[] = ["latin", "latin-ext"];

export const font = {
  titulo: loadBricolage("normal", { weights: ["600", "700"], subsets }).fontFamily,
  ui: loadFigtree("normal", { weights: ["400", "500", "600", "700"], subsets }).fontFamily,
  datos: loadJetBrains("normal", { weights: ["400", "500", "600"], subsets }).fontFamily,
} as const;

/** Borde `ai`: lo que decide la IA lleva este degradado cobalto → bronce. */
export const aiBorder = (fondo: string = color.papel, grosor = 2) => ({
  border: `${grosor}px solid transparent`,
  background: `linear-gradient(${fondo}, ${fondo}) padding-box, linear-gradient(120deg, ${color.cobaltoClaro}, ${color.cobalto} 45%, ${color.bronce}) border-box`,
});

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

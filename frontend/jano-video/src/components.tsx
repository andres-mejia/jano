import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "./theme";

/** Progreso 0→1 con muelle sin rebote, a partir de `delay` fotogramas. */
export const useEnter = (delay = 0, damping = 200, durationInFrames?: number): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping },
    ...(durationInFrames === undefined ? {} : { durationInFrames }),
  });
};

/** Escena con fondo opaco que entra con un fundido corto sobre la anterior. */
export const Scene = ({ bg, children }: { bg: string; children: ReactNode }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: bg, opacity }}>{children}</AbsoluteFill>;
};

/** Aparición: sube 24 px y gana opacidad. */
export const rise = (p: number, distance = 24): CSSProperties => ({
  opacity: p,
  transform: `translateY(${(1 - p) * distance}px)`,
});

export const Eyebrow = ({ children, tone = color.cobalto }: { children: ReactNode; tone?: string }) => (
  <div
    style={{
      fontFamily: font.datos,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: tone,
    }}
  >
    {children}
  </div>
);

type LogoProps = {
  size: number;
  /** 0 = puerta cerrada, 1 = marca canónica. Admite sobrepaso del muelle. */
  open?: number;
  dots?: number;
  leftLeaf?: string;
  dotColor?: string;
};

/** Marca de la puerta (viewBox 32). Las hojas giran sobre sus bisagras exteriores. */
export const Logo = ({
  size,
  open = 1,
  dots = 1,
  leftLeaf = color.papel,
  dotColor = color.tinta,
}: LogoProps) => {
  // Cerrada: cada hoja se estira hasta el centro (x = 16); abierta: ancho canónico de 11.
  const scale = interpolate(open, [0, 1], [12 / 11, 1]);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible" }}>
      <g transform={`translate(4 0) scale(${scale} 1) translate(-4 0)`}>
        <path d="M4 29V15A11 11 0 0 1 15 4v25z" fill={leftLeaf} />
      </g>
      <g transform={`translate(28 0) scale(${scale} 1) translate(-28 0)`}>
        <path d="M17 4a11 11 0 0 1 11 11v14H17z" fill={color.bronce} />
      </g>
      <g opacity={dots}>
        <circle cx={11.5} cy={18} r={1.6} fill={dotColor} />
        <circle cx={20.5} cy={18} r={1.6} fill={dotColor} />
      </g>
    </svg>
  );
};

/** Puntero del sistema dibujado a mano. */
export const Cursor = ({ x, y, press }: { x: number; y: number; press: number }) => (
  <svg
    width={44}
    height={44}
    viewBox="0 0 24 24"
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `scale(${1 - press * 0.12})`,
      transformOrigin: "0 0",
      filter: `drop-shadow(0 6px 10px rgba(20, 22, 43, 0.28))`,
    }}
  >
    <path
      d="M4 2.5v17.2l4.6-4.3 2.9 6.6 2.8-1.2-2.9-6.5h6.3z"
      fill={color.tinta}
      stroke={color.papel}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </svg>
);

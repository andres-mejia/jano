import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Logo, Scene, rise, useEnter } from "../components";
import { color, font } from "../theme";

export const Intro = ({ tagline }: { tagline: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const appear = useEnter(0, 200, 14);
  // Las hojas se abren con un muelle con algo de inercia: pasan un poco y se asientan.
  const open = spring({ frame: frame - 14, fps, config: { damping: 11, stiffness: 90 } });
  const dots = interpolate(frame, [26, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = interpolate(open, [0, 1], [0, 0.55], { extrapolateRight: "clamp" });
  const word = useEnter(30);
  const line = useEnter(46);

  // El grupo marca + palabra se recentra cuando entra "Jano".
  const shift = interpolate(word, [0, 1], [237, 0]);

  return (
    <Scene bg={color.tinta}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, ${color.cobaltoOscuro} 0%, ${color.tinta} 52%)`,
          opacity: glow,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 44, transform: `translateX(${shift}px)` }}>
          <div style={{ opacity: appear, transform: `scale(${0.9 + appear * 0.1})` }}>
            <Logo size={230} open={open} dots={dots} />
          </div>
          <div
            style={{
              fontFamily: font.titulo,
              fontWeight: 700,
              fontSize: 196,
              letterSpacing: "-0.035em",
              color: color.papel,
              lineHeight: 1,
              opacity: word,
              transform: `translateX(${(1 - word) * -30}px)`,
            }}
          >
            Jano
          </div>
        </div>
        <div
          style={{
            marginTop: 56,
            fontFamily: font.ui,
            fontWeight: 500,
            fontSize: 50,
            color: color.niebla,
            ...rise(line),
          }}
        >
          {tagline}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

import { AbsoluteFill } from "remotion";
import { Logo, Scene, rise, useEnter } from "../components";
import type { copy, Lang } from "../copy";
import { color, font } from "../theme";

type Props = { t: (typeof copy)[Lang]["end"] };

export const EndCard = ({ t }: Props) => {
  const mark = useEnter(4);
  const byline = useEnter(16);
  const url = useEnter(26);
  return (
    <Scene bg={color.tinta}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 44%, ${color.cobaltoOscuro} 0%, ${color.tinta} 50%)`,
          opacity: 0.55,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36, ...rise(mark, 20) }}>
          <Logo size={170} />
          <div
            style={{
              fontFamily: font.titulo,
              fontWeight: 700,
              fontSize: 148,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              color: color.papel,
            }}
          >
            Jano
          </div>
        </div>
        <div
          style={{
            marginTop: 44,
            fontFamily: font.ui,
            fontWeight: 500,
            fontSize: 40,
            color: color.niebla,
            ...rise(byline, 16),
          }}
        >
          {t.byline}
        </div>
        <div
          style={{
            marginTop: 28,
            padding: "14px 30px",
            borderRadius: 999,
            border: `2px solid ${color.cobaltoClaro}`,
            fontFamily: font.datos,
            fontWeight: 500,
            fontSize: 34,
            color: color.cobaltoTinte,
            ...rise(url, 16),
          }}
        >
          {t.url}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

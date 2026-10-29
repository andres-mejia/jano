import { AbsoluteFill } from "remotion";
import { Eyebrow, Scene, rise, useEnter } from "../components";
import type { copy, Lang } from "../copy";
import { color, font } from "../theme";

type Props = { t: (typeof copy)[Lang]["rules"] };

export const Rules = ({ t }: Props) => {
  const head = useEnter(6);
  return (
    <Scene bg={color.tinta}>
      <AbsoluteFill style={{ padding: "0 200px", justifyContent: "center" }}>
        <div style={rise(head)}>
          <Eyebrow tone={color.bronce}>{t.eyebrow}</Eyebrow>
        </div>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 34 }}>
          {t.lines.map((line, i) => (
            <Rule key={line} delay={14 + i * 10}>
              {line}
            </Rule>
          ))}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

const Rule = ({ delay, children }: { delay: number; children: string }) => {
  const p = useEnter(delay);
  const tick = useEnter(delay + 6, 14);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 36, ...rise(p, 30) }}>
      <div
        style={{
          width: 64,
          height: 64,
          flex: "none",
          borderRadius: 18,
          border: `2px solid ${color.bronce}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={34} height={34} viewBox="0 0 24 24" style={{ transform: `scale(${tick})` }}>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke={color.bronce}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div
        style={{
          fontFamily: font.titulo,
          fontWeight: 600,
          fontSize: 80,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
          color: color.papel,
        }}
      >
        {children}
      </div>
    </div>
  );
};

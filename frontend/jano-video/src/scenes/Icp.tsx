import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Eyebrow, Scene, rise, useEnter } from "../components";
import type { copy, Lang } from "../copy";
import { aiBorder, color, font } from "../theme";

type Props = { t: (typeof copy)[Lang]["icp"] };

const TYPE_START = 22;
const TYPE_END = 92;
const CHIPS_START = 102;

export const Icp = ({ t }: Props) => {
  const frame = useCurrentFrame();
  const head = useEnter(4);
  const field = useEnter(12);

  const typed = Math.round(
    interpolate(frame, [TYPE_START, TYPE_END], [0, t.prompt.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typing = frame < TYPE_END + 4;
  const caretOn = typing || Math.floor(frame / 15) % 2 === 0;
  const panel = useEnter(CHIPS_START - 6);

  return (
    <Scene bg={color.niebla}>
      <AbsoluteFill style={{ padding: "0 160px", flexDirection: "column", justifyContent: "center" }}>
        <div style={rise(head)}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <div
            style={{
              marginTop: 18,
              fontFamily: font.titulo,
              fontWeight: 700,
              fontSize: 76,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
              color: color.tinta,
            }}
          >
            {t.title}
          </div>
        </div>

        <div
          style={{
            marginTop: 64,
            backgroundColor: color.papel,
            border: `2px solid ${color.linea}`,
            borderRadius: 24,
            padding: "36px 44px",
            minHeight: 168,
            boxShadow: `0 18px 40px -24px ${color.tinta2}`,
            fontFamily: font.ui,
            fontSize: 40,
            fontWeight: 500,
            lineHeight: 1.35,
            color: color.tinta,
            ...rise(field),
          }}
        >
          {t.prompt.slice(0, typed)}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 44,
              marginLeft: 4,
              verticalAlign: "-6px",
              backgroundColor: color.cobalto,
              opacity: caretOn ? 1 : 0,
            }}
          />
        </div>

        <div
          style={{
            marginTop: 40,
            borderRadius: 24,
            padding: "28px 36px 34px",
            ...aiBorder(color.papel, 3),
            ...rise(panel),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Sparkle />
            <span style={{ fontFamily: font.ui, fontSize: 24, fontWeight: 600, color: color.cobalto }}>
              {t.aiLabel}
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 22 }}>
            {t.chips.map((chip, i) => (
              <Chip key={chip.label} label={chip.label} value={chip.value} delay={CHIPS_START + i * 8} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

const Chip = ({ label, value, delay }: { label: string; value: string; delay: number }) => {
  const p = useEnter(delay, 14);
  return (
    <div
      style={{
        flex: "1 1 0",
        backgroundColor: color.cobaltoTinte,
        borderRadius: 16,
        padding: "18px 22px",
        opacity: Math.min(1, p * 1.4),
        transform: `translateY(${(1 - p) * 18}px) scale(${0.94 + 0.06 * p})`,
      }}
    >
      <div
        style={{
          fontFamily: font.datos,
          fontSize: 18,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: color.muted,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8, fontFamily: font.ui, fontWeight: 600, fontSize: 30, color: color.tinta }}>
        {value}
      </div>
    </div>
  );
};

export const Sparkle = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="spark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={color.cobalto} />
        <stop offset="1" stopColor={color.bronce} />
      </linearGradient>
    </defs>
    <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill="url(#spark)" />
  </svg>
);

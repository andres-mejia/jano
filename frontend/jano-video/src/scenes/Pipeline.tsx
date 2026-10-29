import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Eyebrow, Logo, Scene, rise, useEnter } from "../components";
import type { copy, Lang } from "../copy";
import { color, font } from "../theme";

type Props = { t: (typeof copy)[Lang]["pipeline"] };

const NODE_W = 280;
const NODE_H = 210;
const GAP = 72;
const ROW_TOP = 560;
const ROW_Y = ROW_TOP + NODE_H / 2;
const ORQ_W = 820;
const ORQ_TOP = 300;
const ORQ_H = 128;
const ORQ_BOTTOM = ORQ_TOP + ORQ_H;
const LEFT = (1920 - (5 * NODE_W + 4 * GAP)) / 2;
const centerX = (i: number) => LEFT + NODE_W / 2 + i * (NODE_W + GAP);

const COUNT_START = 54;
const COUNT_STEP = 24;
const COUNT_LEN = 34;

type Pt = { x: number; y: number };
const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, s: number): Pt => {
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
};

const fan = (i: number): [Pt, Pt, Pt, Pt] => {
  const start = { x: 960 + (i - 1.5) * 120, y: ORQ_BOTTOM };
  const end = { x: centerX(i), y: ROW_TOP };
  return [start, { x: start.x, y: start.y + 80 }, { x: end.x, y: end.y - 80 }, end];
};
const fanPath = (i: number) => {
  const [a, b, c, d] = fan(i);
  return `M${a.x} ${a.y}C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;
};

export const Pipeline = ({ t }: Props) => {
  const frame = useCurrentFrame();
  const head = useEnter(4);
  const orq = useEnter(12);
  const fanDraw = interpolate(frame, [26, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const flowStart = centerX(0);
  const flowEnd = centerX(4);
  const flowHead = interpolate(
    frame,
    [COUNT_START, COUNT_START + 4 * COUNT_STEP + COUNT_LEN * 0.4],
    [flowStart, flowEnd],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );
  const motor = useEnter(150);

  // Partículas: viajan por la línea de flujo y por el abanico del orquestador.
  const flowParticles = Array.from({ length: 22 }, (_, k) => {
    const len = flowEnd - flowStart;
    const x = flowStart + ((frame * 6 + k * (len / 22)) % len);
    return x <= flowHead ? x : null;
  });
  const fanParticles = [0, 1, 2, 3].flatMap((i) =>
    [0, 0.5].map((offset) => {
      const s = ((frame - 52) / 40 + offset + i * 0.17) % 1;
      return frame > 52 ? bezier(...fan(i), s) : null;
    }),
  );

  return (
    <Scene bg={color.niebla}>
      <AbsoluteFill style={{ padding: "96px 160px" }}>
        <div style={rise(head)}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <div
            style={{
              marginTop: 14,
              fontFamily: font.titulo,
              fontWeight: 700,
              fontSize: 76,
              letterSpacing: "-0.025em",
              color: color.tinta,
            }}
          >
            {t.title}
          </div>
        </div>
      </AbsoluteFill>

      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={fanPath(i)}
            fill="none"
            stroke={color.cobaltoClaro}
            strokeWidth={3}
            strokeDasharray="1 1"
            pathLength={1}
            strokeDashoffset={1 - fanDraw}
            opacity={0.7}
          />
        ))}
        <line x1={flowStart} y1={ROW_Y} x2={flowEnd} y2={ROW_Y} stroke={color.linea} strokeWidth={6} />
        <line
          x1={flowStart}
          y1={ROW_Y}
          x2={flowHead}
          y2={ROW_Y}
          stroke={color.cobalto}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {flowParticles.map((x, k) =>
          x === null ? null : <circle key={k} cx={x} cy={ROW_Y} r={6} fill={k % 3 === 0 ? color.bronce : color.cobaltoTinte} />,
        )}
        {fanParticles.map((p, k) =>
          p === null ? null : <circle key={`f${k}`} cx={p.x} cy={p.y} r={5} fill={color.cobalto} opacity={fanDraw} />,
        )}
      </svg>

      {/* Orquestador */}
      <div
        style={{
          position: "absolute",
          left: (1920 - ORQ_W) / 2,
          top: ORQ_TOP,
          width: ORQ_W,
          height: ORQ_H,
          borderRadius: 24,
          backgroundColor: color.tinta,
          display: "flex",
          alignItems: "center",
          gap: 26,
          padding: "0 36px",
          boxShadow: `0 24px 48px -28px ${color.tinta}`,
          ...rise(orq),
        }}
      >
        <Logo size={64} />
        <div>
          <div style={{ fontFamily: font.titulo, fontWeight: 700, fontSize: 40, color: color.papel }}>
            {t.orquestador}
          </div>
          <div style={{ fontFamily: font.ui, fontSize: 24, color: color.cobaltoTinte, marginTop: 2 }}>
            {t.orquestadorSub}
          </div>
        </div>
      </div>

      {t.nodes.map((node, i) => (
        <Node key={node.name} index={i} name={node.name} value={node.value} unit={node.unit} />
      ))}

      <div
        style={{
          position: "absolute",
          top: ROW_TOP + NODE_H + 56,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          ...rise(motor, 16),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 26px",
            borderRadius: 999,
            backgroundColor: color.papel,
            border: `2px solid ${color.linea}`,
            fontFamily: font.ui,
            fontSize: 26,
            fontWeight: 500,
            color: color.tinta,
          }}
        >
          <Shield />
          {t.motor}
        </div>
      </div>
    </Scene>
  );
};

const Node = ({ index, name, value, unit }: { index: number; name: string; value: number; unit: string }) => {
  const frame = useCurrentFrame();
  const appear = useEnter(30 + index * 6);
  const start = COUNT_START + index * COUNT_STEP;
  const p = interpolate(frame, [start, start + COUNT_LEN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const done = interpolate(frame, [start + COUNT_LEN - 6, start + COUNT_LEN + 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isGoal = index === 4;
  const accent = isGoal ? color.bronce : color.cobalto;
  return (
    <div
      style={{
        position: "absolute",
        left: centerX(index) - NODE_W / 2,
        top: ROW_TOP,
        width: NODE_W,
        height: NODE_H,
        borderRadius: 22,
        backgroundColor: isGoal ? (done > 0.5 ? color.bronceTinte : color.papel) : color.papel,
        border: `2px solid ${done > 0.5 ? accent : color.linea}`,
        padding: "24px 26px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: `0 18px 36px -26px ${color.tinta2}`,
        ...rise(appear),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accent }} />
        <div style={{ fontFamily: font.ui, fontWeight: 600, fontSize: 26, color: color.tinta }}>{name}</div>
      </div>
      <div>
        <div
          style={{
            fontFamily: font.datos,
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            color: p > 0 ? color.tinta : color.linea,
          }}
        >
          {Math.round(value * p)}
        </div>
        <div style={{ fontFamily: font.ui, fontSize: 24, color: color.muted, marginTop: 6 }}>{unit}</div>
      </div>
    </div>
  );
};

const Shield = () => (
  <svg width={28} height={28} viewBox="0 0 24 24">
    <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill={color.cobalto} />
    <path d="M8.5 12l2.4 2.4 4.6-4.8" fill="none" stroke={color.papel} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

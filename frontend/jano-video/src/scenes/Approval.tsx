import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Cursor, Eyebrow, Scene, rise, useEnter } from "../components";
import type { copy, Lang } from "../copy";
import { aiBorder, color, font } from "../theme";
import { Sparkle } from "./Icp";

type Props = { t: (typeof copy)[Lang]["approval"] };

const CARD_W = 940;
const CARD_H = 660;
const CARD_LEFT = 820;
const CARD_TOP = 150;
const BTN_W = 340;
const BTN_H = 72;
const PAD = 44;
const BTN = { x: CARD_W - PAD - BTN_W / 2, y: CARD_H - 40 - BTN_H / 2 };

const CLICK = 104;
const TOAST_IN = 110;
const TICK = 6;
const COUNT_FROM = 10;
const SENT = TOAST_IN + 6 + COUNT_FROM * TICK;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Approval = ({ t }: Props) => {
  const frame = useCurrentFrame();
  const head = useEnter(4);
  const card = useEnter(14);
  const why = useEnter(46);

  const move = interpolate(frame, [64, CLICK - 4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cursorX = interpolate(move, [0, 1], [CARD_W + 120, BTN.x + 30]);
  const cursorY = interpolate(move, [0, 1], [CARD_H + 220, BTN.y + 4]);
  const press = interpolate(frame, [CLICK - 2, CLICK + 2, CLICK + 8], [0, 1, 0], clamp);
  const cursorOpacity = interpolate(frame, [60, 66, CLICK + 24, CLICK + 34], [0, 1, 1, 0], clamp);
  const ripple = interpolate(frame, [CLICK, CLICK + 18], [0, 1], clamp);

  const toast = useEnter(TOAST_IN, 16);
  const elapsed = Math.max(0, frame - TOAST_IN - 6);
  const remaining = Math.max(1, COUNT_FROM - Math.floor(elapsed / TICK));
  const bar = interpolate(frame, [TOAST_IN + 6, SENT], [1, 0], clamp);
  // Relevo limpio: el aviso de cuenta atrás se va antes de que entre la confirmación.
  const leaving = interpolate(frame, [SENT, SENT + 5], [0, 1], clamp);
  const sent = interpolate(frame, [SENT + 4, SENT + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const clicked = frame >= CLICK;

  return (
    <Scene bg={color.niebla}>
      <AbsoluteFill style={{ padding: "0 0 0 160px", justifyContent: "center" }}>
        <div style={{ width: 620, ...rise(head) }}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <div
            style={{
              marginTop: 18,
              fontFamily: font.titulo,
              fontWeight: 700,
              fontSize: 74,
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              color: color.tinta,
            }}
          >
            {t.title}
          </div>
          <div style={{ marginTop: 28, fontFamily: font.ui, fontSize: 30, lineHeight: 1.4, color: color.muted }}>
            {t.sub}
          </div>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: CARD_LEFT,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 28,
          padding: `36px ${PAD}px`,
          boxShadow: `0 30px 60px -36px ${color.tinta}`,
          ...aiBorder(color.papel, 3),
          ...rise(card, 40),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              backgroundColor: color.cobaltoTinte,
              fontFamily: font.ui,
              fontSize: 22,
              fontWeight: 600,
              color: color.cobaltoOscuro,
            }}
          >
            <Sparkle size={22} />
            {t.badge}
          </div>
          <div style={{ fontFamily: font.datos, fontSize: 20, color: color.muted }}>Microsoft 365</div>
        </div>

        <div style={{ marginTop: 26, fontFamily: font.ui, fontSize: 24, color: color.muted, lineHeight: 1.6 }}>
          <div>
            {t.to}: <span style={{ color: color.tinta, fontWeight: 600 }}>Pablo Ferrer</span>{" "}
            <span style={{ fontFamily: font.datos, fontSize: 21 }}>&lt;pablo.ferrer@viajesalbufera.example&gt;</span>
          </div>
          <div>
            {t.subjectLabel}: <span style={{ color: color.tinta, fontWeight: 600 }}>{t.subject}</span>
          </div>
        </div>

        <div style={{ height: 2, backgroundColor: color.linea, margin: "22px 0" }} />

        <div style={{ fontFamily: font.ui, fontSize: 28, lineHeight: 1.45, color: color.tinta }}>
          {t.body.map((line, i) => (
            <BodyLine key={i} delay={24 + i * 7}>
              {line}
            </BodyLine>
          ))}
        </div>

        <div
          style={{
            marginTop: 22,
            display: "inline-flex",
            padding: "10px 18px",
            borderRadius: 14,
            backgroundColor: color.bronceTinte,
            fontFamily: font.ui,
            fontSize: 22,
            fontWeight: 500,
            color: color.tinta,
            ...rise(why, 10),
          }}
        >
          {t.why}
        </div>

        <div style={{ position: "absolute", right: PAD, bottom: 40, display: "flex", gap: 16 }}>
          <div
            style={{
              height: BTN_H,
              padding: "0 30px",
              borderRadius: 16,
              border: `2px solid ${color.linea}`,
              display: "flex",
              alignItems: "center",
              fontFamily: font.ui,
              fontSize: 26,
              fontWeight: 600,
              color: color.tinta,
            }}
          >
            {t.edit}
          </div>
          <div
            style={{
              position: "relative",
              width: BTN_W,
              height: BTN_H,
              borderRadius: 16,
              backgroundColor: clicked ? color.cobaltoOscuro : color.cobalto,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontFamily: font.ui,
              fontSize: 26,
              fontWeight: 600,
              color: color.papel,
              transform: `scale(${1 - press * 0.04})`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 380,
                height: 380,
                borderRadius: 190,
                backgroundColor: color.cobaltoClaro,
                opacity: (1 - ripple) * 0.6,
                transform: `scale(${ripple})`,
              }}
            />
            <span style={{ position: "relative" }}>{t.approve}</span>
          </div>
        </div>

        <div style={{ position: "absolute", left: cursorX, top: cursorY, opacity: cursorOpacity }}>
          <Cursor x={0} y={0} press={press} />
        </div>
      </div>

      {/* Aviso con cuenta atrás y deshacer; después, confirmación de envío. */}
      <div
        style={{
          position: "absolute",
          left: CARD_LEFT + (CARD_W - 640) / 2,
          top: CARD_TOP + CARD_H + 36,
          width: 640,
          height: 84,
          borderRadius: 18,
          backgroundColor: color.tinta,
          overflow: "hidden",
          boxShadow: `0 20px 40px -24px ${color.tinta}`,
          ...rise(toast, 30),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 30px",
            opacity: 1 - leaving,
          }}
        >
          <span style={{ fontFamily: font.ui, fontSize: 28, fontWeight: 500, color: color.papel }}>
            {t.sending}{" "}
            <span style={{ fontFamily: font.datos, fontVariantNumeric: "tabular-nums" }}>{remaining}</span>
            {" s"}
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 28, fontWeight: 700, color: color.bronce }}>{t.undo}</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 5,
            width: `${bar * 100}%`,
            backgroundColor: color.bronce,
            opacity: 1 - leaving,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "0 30px",
            opacity: sent,
            transform: `translateY(${(1 - sent) * 14}px)`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: color.verde,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={26} stroke={color.papel} />
          </div>
          <div>
            <div style={{ fontFamily: font.ui, fontSize: 28, fontWeight: 600, color: color.papel }}>{t.sent}</div>
            <div style={{ fontFamily: font.ui, fontSize: 20, color: color.cobaltoTinte }}>{t.sentSub}</div>
          </div>
        </div>
      </div>
    </Scene>
  );
};

const BodyLine = ({ delay, children }: { delay: number; children: string }) => {
  const p = useEnter(delay);
  return <p style={{ margin: "0 0 10px", ...rise(p, 10) }}>{children}</p>;
};

const Check = ({ size, stroke }: { size: number; stroke: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={stroke} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

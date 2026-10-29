"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { AiTag, Button, Card, Dot, Pill, Skeleton, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { DEMO_IDS } from "@jano/demo";
import { AGENT_LABEL, formatTime } from "@/lib/format";
import type { EventType, ProspectStage } from "@jano/domain";

/**
 * Tres significados de color y nada más: lo decidió la IA (borde `ai`), una regla
 * frenó algo (rojo) y lo demás, texto.
 */
const EVENT_LABEL: Record<EventType, string> = {
  decision: "Decisión de la IA",
  sent: "Enviado",
  blocked: "Bloqueado por regla",
  deferred: "Aplazado por regla",
  stopped: "Secuencia detenida",
  replied: "Respondió",
  approved: "Aprobado",
  rejected: "Descartado",
  opt_out: "Baja",
  meeting_booked: "Reunión agendada",
};
const FRENADO: ReadonlySet<EventType> = new Set(["blocked", "deferred", "opt_out"]);

function EventoTipo({ type, reasoning }: { type: EventType; reasoning: string | null }) {
  if (type === "decision") return <AiTag reason={reasoning ?? undefined}>{EVENT_LABEL[type]}</AiTag>;
  if (FRENADO.has(type)) return <Pill tone="r">{EVENT_LABEL[type]}</Pill>;
  return <span className="text-sm text-jano-muted">{EVENT_LABEL[type]}</span>;
}

const NW = 150;
const GAP = 38;
const X0 = 12;

export default function FlowPage() {
  const campaignId = DEMO_IDS.campaign;
  const flow = useQuery({ queryKey: ["flow", campaignId], queryFn: () => jano.getFlowMap(campaignId) });
  const [stage, setStage] = useState<ProspectStage>("in_sequence");
  const [sugerenciaOculta, setSugerenciaOculta] = useState(false);
  const events = useQuery({ queryKey: ["stage-events", campaignId, stage], queryFn: () => jano.listStageEvents(campaignId, stage) });
  const f = flow.data;

  return (
    <>
      <Topbar title="Mapa de flujo" subtitle="Dónde está cada prospect y qué ha pasado en cada etapa" />

      <Card className="p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold">Campaña: {f?.campaignName ?? "…"}</h2>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-jano-verde-texto">
            <Dot tone="g" />
            En directo
          </span>
          <span className="ml-auto text-sm text-jano-muted">Últimos 30 días · el grosor de cada tramo es el volumen que pasa</span>
        </div>
        {!f ? (
          <Skeleton className="h-[300px]" />
        ) : (
          <div className="bg-jano-lienzo relative h-[300px] overflow-x-auto rounded-xl">
            <svg width={X0 + f.nodes.length * (NW + GAP)} height="330" className="absolute left-0 top-0" fill="none" aria-hidden="true">
              {f.nodes.slice(0, -1).map((n, i) => {
                const x1 = X0 + i * (NW + GAP) + NW;
                const next = f.nodes[i + 1];
                // Grosor proporcional a lo que pasa al siguiente nodo, acotado: el nodo ICP no es volumen.
                const ratio = next && n.stage !== "icp" ? Math.min(1, Math.max(0.12, next.value / Math.max(n.value, 1))) : 1;
                const last = i === f.nodes.length - 2;
                return <path key={n.stage} d={`M${x1} 100 L${x1 + GAP} 100`} stroke={last ? "var(--color-jano-bronce)" : "var(--color-jano-cobalto)"} strokeWidth={3 + 14 * ratio} strokeLinecap="round" opacity=".55" />;
              })}
              {f.exits.map((e) => {
                const i = f.nodes.findIndex((n) => n.stage === e.afterStage);
                const cx = X0 + i * (NW + GAP) + NW / 2;
                return <path key={e.label} d={`M${cx} 156 L${cx} 222`} stroke="var(--color-jano-gris-medio)" strokeWidth="2" strokeDasharray="4 5" />;
              })}
            </svg>
            {f.nodes.map((n, i) => {
              const x = X0 + i * (NW + GAP);
              const end = n.stage === "meeting";
              const selectable = n.stage !== "icp";
              const selected = n.stage === stage;
              return (
                <button
                  type="button"
                  key={n.stage}
                  disabled={!selectable}
                  onClick={() => selectable && setStage(n.stage as ProspectStage)}
                  className={clsx(
                    "absolute top-11 h-28 rounded-2xl border p-3 text-left",
                    end ? "border-jano-tinta bg-jano-tinta text-white" : "border-jano-linea bg-jano-papel",
                    selected && "shadow-[0_0_0_2px_var(--color-jano-cobalto),0_10px_26px_color-mix(in_srgb,var(--color-jano-cobalto)_22%,transparent)]",
                  )}
                  style={{ left: x, width: NW }}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Dot tone={n.active ? "c" : end ? "w" : "g"} />
                    {n.label}
                  </div>
                  <div className={clsx("font-display mt-2.5 font-bold leading-none tabular", i === 0 ? "text-xl" : "text-3xl")}>{i === 0 ? "Definido" : n.value}</div>
                  <div className="mt-1 text-sm opacity-70">{n.note}</div>
                </button>
              );
            })}
            {f.exits.map((e) => {
              const i = f.nodes.findIndex((n) => n.stage === e.afterStage);
              return (
                <div key={e.label} className="absolute top-[222px] rounded-xl border border-dashed border-jano-gris-linea bg-jano-lienzo px-3 py-2" style={{ left: X0 + i * (NW + GAP) + 8, width: NW - 16 }}>
                  <div className="flex justify-between text-sm font-semibold">
                    {e.label}
                    <span className="font-mono tabular">{e.value}</span>
                  </div>
                  <div className="text-xs text-jano-muted">{e.note}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex flex-col items-start gap-3.5 lg:flex-row">
        <Card className="w-full flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-bold">Registros de la etapa: {f?.nodes.find((n) => n.stage === stage)?.label ?? stage}</h2>
            <span className="text-sm text-jano-muted tabular">{f?.nodes.find((n) => n.stage === stage)?.value ?? 0} prospects</span>
          </div>
          <table className="w-full border-collapse text-base">
            <tbody>
              {(events.data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-jano-linea">
                  <td className="font-mono w-16 py-2.5 pr-2.5 text-xs text-jano-muted">{formatTime(e.at)}</td>
                  <td className="w-40 py-2.5 pr-2.5 text-sm text-jano-muted">{AGENT_LABEL[e.agent]}</td>
                  <td className="py-2.5 pr-2.5">
                    <Link href={`/prospects/${e.prospectId}` as "/prospects"} className="hover:underline">
                      {e.summary}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right">
                    <EventoTipo type={e.type} reasoning={e.reasoning} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.data?.length === 0 && <p className="py-6 text-center text-sm text-jano-muted">Sin registros en esta etapa.</p>}
        </Card>

        {!sugerenciaOculta && (
        <Card ai className="w-full shrink-0 lg:w-[290px]" title={<><Spark />Qué ve Jano</>}>
          {f?.bottleneck ? (
            <>
              <p className="text-sm leading-relaxed">{f.bottleneck.text}</p>
              <dl className="mt-2 text-sm">
                <div className="flex justify-between border-t border-jano-linea py-2.5">
                  <dt className="text-jano-muted">Opción</dt>
                  <dd className="font-semibold">{f.bottleneck.option}</dd>
                </div>
                <div className="flex justify-between border-t border-jano-linea py-2.5">
                  <dt className="text-jano-muted">Efecto</dt>
                  <dd className="font-semibold">{f.bottleneck.effect}</dd>
                </div>
              </dl>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => setStage(f.bottleneck?.stage ?? stage)}>
                  Ver la etapa
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSugerenciaOculta(true)}>
                  Ignorar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-jano-muted">Sin cuellos de botella detectados.</p>
          )}
        </Card>
        )}
      </div>
    </>
  );
}

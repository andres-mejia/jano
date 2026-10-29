"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AlertTriangle, Check } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { AvisoDeshacer, useConDeshacer } from "@/components/ui/deshacer";
import { AiTag, Button, Card, Pill, Skeleton, Spark, Tabs } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { STAGE_LABEL, formatRevenue, formatShortDate } from "@/lib/format";
import type { ProspectEvent, SequenceStep, StepStatus } from "@jano/domain";

const STEP_LABEL: Record<StepStatus, string> = {
  planned: "Planificado",
  awaiting_approval: "Espera tu OK",
  sent: "Enviado",
  skipped: "Omitido",
  cancelled: "Cancelado",
  blocked: "Bloqueado",
};

/** Color solo para lo que te necesita (bronce) o lo que una regla frenó (rojo). */
function EstadoPaso({ status }: { status: StepStatus }) {
  if (status === "awaiting_approval") return <Pill tone="b">{STEP_LABEL[status]}</Pill>;
  if (status === "blocked") return <Pill tone="r">{STEP_LABEL[status]}</Pill>;
  return <span className="text-xs font-semibold text-jano-muted">{STEP_LABEL[status]}</span>;
}

const SECUENCIA: Record<string, string> = { consultiva: "Consultiva", trigger: "Por señal de compra" };

const TABS = [
  { id: "mensaje", label: "Mensaje" },
  { id: "razonamiento", label: "Razonamiento" },
  { id: "evidencia", label: "Evidencia" },
  { id: "reglas", label: "Reglas" },
] as const;

function StepNode({ step, selected, onSelect, dim }: { step: SequenceStep; selected: boolean; onSelect: () => void; dim: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full rounded-xl border border-jano-linea bg-jano-papel px-3 py-2 text-left",
        selected && "shadow-[0_0_0_2px_var(--color-jano-cobalto),0_8px_22px_color-mix(in_srgb,var(--color-jano-cobalto)_20%,transparent)]",
        dim && "border-dashed bg-transparent text-jano-muted",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-jano-muted">Día {step.day}</span>
        <EstadoPaso status={step.status} />
      </div>
      <div className="mt-0.5 font-semibold">{step.title}</div>
    </button>
  );
}

export default function ProspectPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["prospect", id], queryFn: () => jano.getProspect(id) });
  const events = useQuery({ queryKey: ["prospect-events", id], queryFn: () => jano.listProspectEvents(id) });
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [tab, setTab] = useState<"mensaje" | "razonamiento" | "evidencia" | "reglas">("mensaje");

  const stop = useMutation({ mutationFn: () => jano.stopProspect(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["prospect", id] }) });
  const approveStep = useMutation({
    mutationFn: (stepId: string) => jano.approveStep(id, stepId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prospect", id] });
      void qc.invalidateQueries({ queryKey: ["prospect-events", id] });
    },
  });

  const envio = useConDeshacer(10);
  const d = detail.data;
  const seq = d?.prospect.sequence ?? null;
  const steps = seq?.steps ?? [];
  const awaiting = steps.find((s) => s.status === "awaiting_approval");
  const sentSteps = steps.filter((s) => s.status === "sent");
  const defaultStep = awaiting ?? sentSteps.at(-1) ?? null;
  const stepId = selectedStep ?? defaultStep?.id ?? null;
  const stepEvents: ProspectEvent[] = (events.data ?? []).filter((e) => e.stepId === stepId);
  const focus: ProspectEvent | undefined = stepEvents.find((e) => e.type === "sent") ?? stepEvents[0];
  const decision: ProspectEvent | undefined = (events.data ?? []).filter((e) => e.type === "decision").at(-1);
  // Paso seleccionado que espera tu OK: se enseña el borrador antes de aprobar, nunca a ciegas.
  const pendiente = steps.find((s) => s.id === stepId && s.status === "awaiting_approval");

  const consultiva = steps.filter((s) => s.channel === "email" && (s.status === "skipped" || s.day === 0 || s.day === 3));
  const triggerBranch = steps.filter((s) => !consultiva.includes(s));

  return (
    <>
      <Topbar
        title={d?.account.name ?? "Prospect"}
        subtitle={d ? `Fit ${d.account.fitScore} · ${d.account.cnae === "7911" ? "Agencia de viajes" : d.account.cnae ?? ""} · ${d.account.city ?? ""} · ${formatRevenue(d.account.revenueEur)}` : ""}
        actions={
          <>
            <Button variant="outline" disabled={!d || stop.isPending || d.prospect.stage === "discarded"} onClick={() => stop.mutate()}>
              Detener secuencia
            </Button>
            {awaiting && (
              <Button
                onClick={() => {
                  setSelectedStep(awaiting.id);
                  setTab("mensaje");
                }}
              >
                Revisar el borrador
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start">
        <Card className="w-full shrink-0 xl:w-[600px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recorrido del prospect</h2>
            {d && <span className="text-sm font-semibold text-jano-muted">{STAGE_LABEL[d.prospect.stage]}</span>}
          </div>
          {!d ? (
            <Skeleton className="h-[520px]" />
          ) : !seq ? (
            <p className="py-10 text-center text-sm text-jano-muted">Este prospect todavía no tiene secuencia.</p>
          ) : (
            <div className="bg-jano-lienzo grid gap-4 rounded-xl p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-jano-muted">Secuencia A · {SECUENCIA[seq.switchedFrom ?? seq.kind] ?? seq.switchedFrom ?? seq.kind}</div>
                {consultiva.map((s) => (
                  <StepNode key={s.id} step={s} selected={s.id === stepId} onSelect={() => setSelectedStep(s.id)} dim={s.status === "skipped"} />
                ))}
                {seq.switchedAt && (
                  <div className="ai-border rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-jano-cobalto-oscuro">
                      <Spark />
                      Decisión de la IA · {formatShortDate(seq.switchedAt)}
                    </div>
                    <div className="text-sm">Señal de compra detectada: cambia de secuencia</div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:pt-16">
                {seq.switchedFrom && <div className="text-xs font-semibold text-jano-cobalto">Secuencia B · {SECUENCIA[seq.kind] ?? seq.kind}</div>}
                {triggerBranch.map((s) => (
                  <StepNode key={s.id} step={s} selected={s.id === stepId} onSelect={() => setSelectedStep(s.id)} dim={s.status === "cancelled" || s.status === "planned"} />
                ))}
              </div>
            </div>
          )}
          {d?.contact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm">
              <b>{d.contact.name}</b>
              <span className="text-jano-muted">
                {d.contact.role} · {d.contact.email}
              </span>
              {d.contact.emailVerified ? (
                <span className="ml-auto font-semibold text-jano-verde-texto tabular">Email verificado · {d.contact.verificationConfidence ?? ""} %</span>
              ) : (
                <Pill tone="b" className="ml-auto">
                  Email sin verificar
                </Pill>
              )}
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Card>
            <div className="mb-2.5 flex items-center">
              <h2 className="font-display text-lg font-bold">Registro del paso: {steps.find((s) => s.id === stepId)?.title ?? "—"}</h2>
              {focus && <span className="font-mono ml-auto text-xs text-jano-muted">{formatShortDate(focus.at)}</span>}
            </div>
            <div className="mb-3">
              <Tabs label="Registro del paso" tabs={TABS} value={tab} onChange={setTab} />
            </div>
            <div className={clsx("rounded-xl px-3.5 py-3 text-sm leading-relaxed", pendiente ? "ai-border" : "bg-jano-niebla")}>
              {!focus && <span className="text-jano-muted">Sin registro para este paso todavía.</span>}
              {focus && tab === "mensaje" && (focus.message ? (
                <>
                  {pendiente && (
                    <div className="mb-2">
                      <AiTag reason={focus.reasoning ?? undefined}>Borrador de la IA · se enviará al aprobar</AiTag>
                    </div>
                  )}
                  {focus.message.subject && <div className="mb-1 text-sm text-jano-muted">Asunto: {focus.message.subject}</div>}
                  <div className="whitespace-pre-line">{focus.message.body}</div>
                  {pendiente && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={approveStep.isPending || envio.pendiente?.id === pendiente.id}
                        onClick={() =>
                          envio.programar({
                            id: pendiente.id,
                            texto: `Enviando «${pendiente.title}» a ${d?.contact?.name ?? "el contacto"}`,
                            hecho: "Enviado desde tu buzón y registrado en la auditoría",
                            ejecutar: () => approveStep.mutate(pendiente.id),
                          })
                        }
                      >
                        {envio.pendiente?.id === pendiente.id ? `Se envía en ${envio.pendiente.restante} s` : "Aprobar y enviar"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate()}>
                        No enviar y detener
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-jano-muted">Este paso no envió ningún mensaje.</span>
              ))}
              {focus && tab === "razonamiento" && <div>{focus.reasoning ?? focus.summary}</div>}
              {focus && tab === "evidencia" && (
                <ul className="font-mono list-disc pl-4 text-sm text-jano-muted">
                  {focus.evidence.length ? focus.evidence.map((e) => <li key={e}>{e}</li>) : <li>Sin evidencia adjunta.</li>}
                </ul>
              )}
              {focus && tab === "reglas" && (
                <ul>
                  {focus.rulesChecked.length ? (
                    focus.rulesChecked.map((r) => (
                      <li key={r.rule} className="flex items-start gap-2 py-1">
                        {r.passed ? <Check className="mt-0.5 h-4 w-4 text-jano-verde" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-jano-bronce-texto" aria-hidden="true" />}
                        <span>
                          {r.rule}
                          {r.detail && <span className="text-jano-muted">: {r.detail}</span>}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-jano-muted">Este paso no comprobó reglas.</li>
                  )}
                </ul>
              )}
            </div>
          </Card>

          <Card ai title="Por qué lo hizo">
            {decision ? (
              <>
                <p className="mb-2 text-sm leading-relaxed">{decision.reasoning ?? decision.summary}</p>
                <ul className="font-mono text-sm leading-7 text-jano-muted">
                  {decision.evidence.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-jano-muted">Sin decisiones registradas.</p>
            )}
          </Card>

          <Card title="Reglas comprobadas antes del último envío">
            <ul>
              {(() => {
                const lastSent = (events.data ?? []).filter((e) => e.type === "sent").at(-1);
                const rules = lastSent?.rulesChecked ?? [];
                return rules.length ? (
                  rules.map((r) => (
                    <li key={r.rule} className="flex items-start gap-2 py-1.5 text-sm">
                      {r.passed ? <Check className="mt-0.5 h-[18px] w-[18px] text-jano-verde" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-[18px] w-[18px] text-jano-bronce-texto" aria-hidden="true" />}
                      <span>
                        {r.rule}
                        {r.detail && <span className="text-jano-muted">: {r.detail}</span>}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-jano-muted">Todavía no se ha enviado nada.</li>
                );
              })()}
            </ul>
          </Card>
        </div>
      </div>
      <AvisoDeshacer estado={envio} />
    </>
  );
}

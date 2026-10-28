"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { AlertTriangle, Check } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, Pill, Skeleton, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { STAGE_LABEL, formatRevenue, formatShortDate } from "@/lib/format";
import type { ProspectEvent, SequenceStep, StepStatus } from "@jano/domain";

const STEP_PILL: Record<StepStatus, { label: string; tone: "g" | "b" | "n" | "r" | "v" }> = {
  planned: { label: "Planificado", tone: "n" },
  awaiting_approval: { label: "Espera tu OK", tone: "b" },
  sent: { label: "Enviado", tone: "n" },
  skipped: { label: "Omitido", tone: "n" },
  cancelled: { label: "Cancelado", tone: "n" },
  blocked: { label: "Bloqueado", tone: "r" },
};

function StepNode({ step, selected, onSelect, dim }: { step: SequenceStep; selected: boolean; onSelect: () => void; dim: boolean }) {
  const pill = STEP_PILL[step.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full rounded-[14px] border border-jano-linea bg-jano-papel px-3 py-2 text-left",
        selected && "shadow-[0_0_0_2px_var(--color-jano-cobalto),0_8px_22px_rgba(67,56,214,0.2)]",
        dim && "border-dashed opacity-50",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-jano-muted">Día {step.day}</span>
        <Pill tone={pill.tone}>{pill.label}</Pill>
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
              <Button disabled={approveStep.isPending} onClick={() => approveStep.mutate(awaiting.id)}>
                Aprobar {awaiting.title}
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 xl:flex-row">
        <Card className="w-full shrink-0 xl:w-[600px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold">Recorrido del prospect</h2>
            {d && <Pill tone="v">{STAGE_LABEL[d.prospect.stage]}</Pill>}
          </div>
          {!d ? (
            <Skeleton className="h-[520px]" />
          ) : !seq ? (
            <p className="py-10 text-center text-sm text-jano-muted">Este prospect todavía no tiene secuencia.</p>
          ) : (
            <div className="dot-grid grid gap-4 rounded-[14px] p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="font-mono text-xs text-jano-muted">SECUENCIA A · {seq.switchedFrom ? seq.switchedFrom.toUpperCase() : seq.kind.toUpperCase()}</div>
                {consultiva.map((s) => (
                  <StepNode key={s.id} step={s} selected={s.id === stepId} onSelect={() => setSelectedStep(s.id)} dim={s.status === "skipped"} />
                ))}
                {seq.switchedAt && (
                  <div className="rounded-[14px] border-[1.5px] border-jano-cobalto bg-jano-cobalto-tinte px-3 py-2 text-jano-cobalto-oscuro">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-bold">
                      <Spark />
                      Decisión de la IA · {formatShortDate(seq.switchedAt)}
                    </div>
                    <div className="text-[13px]">Trigger detectado: cambia de rama</div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:pt-16">
                {seq.switchedFrom && <div className="font-mono text-xs text-jano-cobalto">SECUENCIA B · {seq.kind.toUpperCase()}</div>}
                {triggerBranch.map((s) => (
                  <StepNode key={s.id} step={s} selected={s.id === stepId} onSelect={() => setSelectedStep(s.id)} dim={s.status === "cancelled" || s.status === "planned"} />
                ))}
              </div>
            </div>
          )}
          {d?.contact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[13px]">
              <b>{d.contact.name}</b>
              <span className="text-jano-muted">
                {d.contact.role} · {d.contact.email}
              </span>
              <Pill tone={d.contact.emailVerified ? "g" : "b"} className="ml-auto">
                {d.contact.emailVerified ? `Verificado ${d.contact.verificationConfidence ?? ""} %` : "Sin verificar"}
              </Pill>
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Card>
            <div className="mb-2.5 flex items-center">
              <h2 className="font-display text-[17px] font-bold">Registro del paso: {steps.find((s) => s.id === stepId)?.title ?? "—"}</h2>
              {focus && <span className="font-mono ml-auto text-xs text-jano-muted">{formatShortDate(focus.at)}</span>}
            </div>
            <div className="mb-3 flex gap-1.5">
              {(["mensaje", "razonamiento", "evidencia", "reglas"] as const).map((t) => (
                <Button key={t} size="sm" variant={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
            <div className="rounded-xl bg-jano-niebla px-3.5 py-3 text-[13.5px] leading-relaxed">
              {!focus && <span className="text-jano-muted">Sin registro para este paso todavía.</span>}
              {focus && tab === "mensaje" && (focus.message ? (
                <>
                  {focus.message.subject && <div className="mb-1 text-[12.5px] text-jano-muted">Asunto: {focus.message.subject}</div>}
                  <div className="whitespace-pre-line">{focus.message.body}</div>
                </>
              ) : (
                <span className="text-jano-muted">Este paso no envió ningún mensaje.</span>
              ))}
              {focus && tab === "razonamiento" && <div>{focus.reasoning ?? focus.summary}</div>}
              {focus && tab === "evidencia" && (
                <ul className="font-mono list-disc pl-4 text-[13px] text-jano-muted">
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

          <Card ai title={<><Spark />Por qué lo hizo</>}>
            {decision ? (
              <>
                <p className="mb-2 text-[13.5px] leading-relaxed">{decision.reasoning ?? decision.summary}</p>
                <ul className="font-mono text-[13px] leading-7 text-jano-muted">
                  {decision.evidence.map((e) => (
                    <li key={e}>· {e}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13.5px] text-jano-muted">Sin decisiones registradas.</p>
            )}
          </Card>

          <Card title="Reglas comprobadas antes del último envío" className="flex-1">
            <ul>
              {(() => {
                const lastSent = (events.data ?? []).filter((e) => e.type === "sent").at(-1);
                const rules = lastSent?.rulesChecked ?? [];
                return rules.length ? (
                  rules.map((r) => (
                    <li key={r.rule} className="flex items-start gap-2 py-1.5 text-[13.5px]">
                      {r.passed ? <Check className="mt-0.5 h-[18px] w-[18px] text-jano-verde" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-[18px] w-[18px] text-jano-bronce-texto" aria-hidden="true" />}
                      <span>
                        {r.rule}
                        {r.detail && <span className="text-jano-muted">: {r.detail}</span>}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-[13.5px] text-jano-muted">Todavía no se ha enviado nada.</li>
                );
              })()}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

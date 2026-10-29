"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, X } from "lucide-react";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { AiTag, Card, ListItem, Meter, Pill, Skeleton } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { AGENT_LABEL, formatTime } from "@/lib/format";
import type { EventType, Guardrails } from "@jano/domain";

const EVENT_LABEL: Record<EventType, string> = {
  decision: "Decisión de la IA",
  sent: "Enviado",
  blocked: "Bloqueado",
  deferred: "Aplazado por límite",
  stopped: "Detenido",
  replied: "Clasificada por la IA",
  approved: "Aprobado",
  rejected: "Descartado",
  opt_out: "Baja",
  meeting_booked: "Reunión",
};

/** Lo que decidió la IA lleva su borde; lo que frenó una regla, rojo; el resto, texto. */
function EventoTipo({ type }: { type: EventType }) {
  if (type === "decision" || type === "replied") return <AiTag>{EVENT_LABEL[type]}</AiTag>;
  if (type === "blocked" || type === "opt_out" || type === "deferred") return <Pill tone="r">{EVENT_LABEL[type]}</Pill>;
  return <span className="text-sm text-jano-muted">{EVENT_LABEL[type]}</span>;
}

function Comprobacion({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${ok ? "text-jano-verde-texto" : "text-jano-rojo-texto"}`}>
      {ok ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
      {children}
    </span>
  );
}

function Toggle({ label, help, checked, onChange, disabled }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <ListItem>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-sm text-jano-muted">{help}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`ml-auto flex h-[22px] w-[38px] shrink-0 rounded-full p-[3px] transition ${checked ? "justify-end bg-jano-cobalto" : "justify-start bg-jano-nav-texto"} disabled:opacity-60`}
      >
        <span className="h-4 w-4 rounded-full bg-white" />
      </button>
    </ListItem>
  );
}

export default function CompliancePage() {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["compliance"], queryFn: jano.getComplianceSummary });
  const guardrails = useQuery({ queryKey: ["guardrails"], queryFn: jano.getGuardrails });
  const audit = useQuery({ queryKey: ["audit"], queryFn: jano.listAudit });
  const save = useMutation({ mutationFn: (g: Guardrails) => jano.setGuardrails(g), onSuccess: () => void qc.invalidateQueries({ queryKey: ["guardrails"] }) });

  const s = summary.data;
  const g = guardrails.data;
  const set = (patch: Partial<Guardrails>) => g && save.mutate({ ...g, ...patch });

  return (
    <>
      <Topbar title="Cumplimiento" subtitle="Qué puede hacer la IA, qué no, y la prueba de cada decisión" autopilot={g?.autopilot ?? false} />

      {!s ? (
        <Skeleton className="h-28" />
      ) : (
        <Card className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-sm font-semibold text-jano-muted">Envíos de hoy</div>
            <div className="font-display my-1 text-2xl font-bold leading-none tabular">
              {s.sendsToday} <span className="text-base font-semibold text-jano-muted">de {s.sendsLimit}</span>
            </div>
            <Meter value={s.sendsToday / Math.max(s.sendsLimit, 1)} tone={s.sendsToday >= s.sendsLimit ? "w" : "c"} label="Envíos de hoy sobre el límite" />
            <div className="mt-1.5 text-sm text-jano-muted">Buzón principal</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-jano-muted">Contactos con origen</div>
            <div className="font-display my-1 text-2xl font-bold leading-none tabular">{Math.round((100 * s.contactsWithSource) / Math.max(s.contactsTotal, 1))} %</div>
            <div className="text-sm text-jano-muted tabular">
              {s.contactsWithSource} de {s.contactsTotal} con su fuente guardada
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-jano-muted">Bajas atendidas</div>
            <div className="font-display my-1 text-2xl font-bold leading-none tabular">
              {s.optOutsHandled} <span className="text-base font-semibold text-jano-muted">de {s.optOutsTotal}</span>
            </div>
            <div className="text-sm text-jano-muted">En menos de 1 minuto</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-jano-muted">Base legal validada</div>
            <div className="font-display my-1 text-2xl font-bold leading-none tabular">{Math.round(s.legalBasisValidatedPct)} %</div>
            <div className={`text-sm ${s.legalOpinionPending ? "font-semibold text-jano-bronce-texto" : "text-jano-muted"}`}>
              {s.legalOpinionPending ? "Pendiente de dictamen" : "Dictamen aplicado"}
            </div>
          </div>
        </Card>
      )}

      {s?.legalOpinionPending && (
        <div className="flex items-center gap-3 rounded-2xl border border-jano-bronce-linea bg-jano-bronce-tinte p-4 text-sm text-jano-bronce-texto">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <b>Pendiente de validación legal.</b> La base jurídica para el primer contacto por email (LSSI art. 21) está por confirmar. Jano guarda el origen de cada dato y aplica la regla que se decida; hasta entonces, ningún entorno escribe a contactos reales.
          </div>
          <Link href="/prospects" className="ml-auto shrink-0 rounded-lg bg-jano-papel px-3.5 py-2 text-sm font-semibold text-jano-tinta shadow-[inset_0_0_0_1px_var(--color-jano-linea)]">
            Ver contactos afectados
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start">
        <Card className="w-full flex-1" title="Registro de auditoría" action={<span className="text-sm font-normal text-jano-muted">Cada decisión, con la regla que se aplicó</span>}>
          <table className="w-full border-collapse text-base">
            <tbody>
              {(audit.data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-jano-linea">
                  <td className="font-mono w-14 py-2.5 pr-2.5 text-xs text-jano-muted">{formatTime(e.at)}</td>
                  <td className="w-32 py-2.5 pr-2.5 font-semibold">{AGENT_LABEL[e.agent]}</td>
                  <td className="py-2.5 pr-2.5">
                    {e.prospectId ? (
                      <Link href={`/prospects/${e.prospectId}` as "/prospects"} className="hover:underline">
                        {e.accountName}: {e.summary}
                      </Link>
                    ) : (
                      e.summary
                    )}
                    {e.ruleApplied && <div className="text-xs text-jano-muted">Regla: {e.ruleApplied}</div>}
                  </td>
                  <td className="py-2.5 text-right">
                    <EventoTipo type={e.type} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[360px]">
          <Card title="Reglas que la IA no puede saltarse">
            {g && (
              <ul>
                <ListItem>
                  <div>
                    <div className="text-sm font-semibold">Máximo de envíos por buzón y día</div>
                    <div className="text-sm text-jano-muted">Protege la reputación del dominio</div>
                  </div>
                  <input type="number" min={1} max={200} value={g.maxSendsPerMailboxPerDay} onChange={(e) => set({ maxSendsPerMailboxPerDay: Number(e.target.value) })} className="font-mono ml-auto w-16 rounded-lg border border-jano-linea px-2 py-1 text-right text-sm tabular" aria-label="Máximo de envíos por buzón y día" />
                </ListItem>
                <Toggle label="No enviar a emails sin verificar" help="Si el verificador no lo confirma, no sale" checked={g.requireVerifiedEmail} onChange={(v) => set({ requireVerifiedEmail: v })} />
                <Toggle label="WhatsApp solo tras una respuesta" help="Nunca en frío" checked={g.whatsappOnlyAfterReply} onChange={(v) => set({ whatsappOnlyAfterReply: v })} />
                <Toggle label="Detener la secuencia al responder" help="Sin seguimientos de más" checked={g.stopSequenceOnReply} onChange={(v) => set({ stopSequenceOnReply: v })} />
                <Toggle label="Piloto automático" help="La IA envía sin aprobación. Queda en auditoría." checked={g.autopilot} onChange={(v) => set({ autopilot: v })} />
              </ul>
            )}
          </Card>
          <Card title="Salud del dominio de envío">
            {(s?.domains ?? []).map((d) => (
              <div key={d.domain}>
                <div className="font-mono mb-2 text-xs text-jano-muted">{d.domain}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <Comprobacion ok={d.spf}>SPF</Comprobacion>
                  <Comprobacion ok={d.dkim}>DKIM</Comprobacion>
                  <Comprobacion ok={d.dmarc}>DMARC</Comprobacion>
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="font-semibold">Calentamiento del dominio</span>
                  <span className="text-jano-muted tabular">
                    día {d.warmupDay} de {d.warmupTotalDays}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter value={d.warmupDay / Math.max(d.warmupTotalDays, 1)} label="Calentamiento del dominio" />
                </div>
                <div className="mt-2.5 text-sm text-jano-muted tabular">
                  Tasa de rebote {d.bounceRatePct.toLocaleString("es-ES")} % · Quejas {d.complaints}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

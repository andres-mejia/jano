"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, ListItem, Pill, Skeleton } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { AGENT_LABEL, formatTime } from "@/lib/format";
import type { EventType, Guardrails } from "@jano/domain";

const EVENT_PILL: Record<EventType, { label: string; tone: "g" | "b" | "r" | "v" | "n" }> = {
  decision: { label: "Decisión IA", tone: "v" },
  sent: { label: "Enviado", tone: "n" },
  blocked: { label: "Bloqueado", tone: "b" },
  deferred: { label: "Límite", tone: "b" },
  stopped: { label: "Detenido", tone: "g" },
  replied: { label: "Decisión IA", tone: "v" },
  approved: { label: "Aprobado", tone: "g" },
  rejected: { label: "Descartado", tone: "n" },
  opt_out: { label: "Baja", tone: "r" },
  meeting_booked: { label: "Reunión", tone: "g" },
};

function Gauge({ pct, color }: { pct: number; color: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#E9EAF1" strokeWidth="9" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 38 38)" />
    </svg>
  );
}

function Toggle({ label, help, checked, onChange, disabled }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <ListItem>
      <div>
        <div className="text-[13.5px] font-semibold">{label}</div>
        <div className="text-[12.5px] text-jano-muted">{help}</div>
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
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Envíos de hoy", `${s.sendsToday} de ${s.sendsLimit}`, "Buzón principal", s.sendsToday / s.sendsLimit, "#4338D6"],
              ["Contactos con origen", `${Math.round((100 * s.contactsWithSource) / Math.max(s.contactsTotal, 1))} %`, `${s.contactsWithSource} de ${s.contactsTotal}`, s.contactsWithSource / Math.max(s.contactsTotal, 1), "#1B7F5C"],
              ["Bajas atendidas", `${s.optOutsHandled} de ${s.optOutsTotal}`, "En menos de 1 minuto", s.optOutsTotal ? s.optOutsHandled / s.optOutsTotal : 1, "#1B7F5C"],
              ["Base legal validada", `${Math.round(s.legalBasisValidatedPct)} %`, s.legalOpinionPending ? "Pendiente de dictamen" : "Dictamen aplicado", Math.max(0.04, s.legalBasisValidatedPct / 100), "#E39A2E"],
            ] as const
          ).map(([label, value, note, pct, color]) => (
            <Card key={label} className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-jano-muted">{label}</div>
                <div className="font-display my-1 text-[30px] font-bold leading-none tabular">{value}</div>
                <div className="text-[12.5px] text-jano-muted">{note}</div>
              </div>
              <Gauge pct={pct} color={color} />
            </Card>
          ))}
        </div>
      )}

      {s?.legalOpinionPending && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#EFD3A0] bg-jano-bronce-tinte p-4 text-[13.5px] text-jano-bronce-texto">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <b>Pendiente de validación legal.</b> La base jurídica para el primer contacto por email (LSSI art. 21) está por confirmar. Jano guarda el origen de cada dato y aplica la regla que se decida; hasta entonces, ningún entorno escribe a contactos reales.
          </div>
          <Link href="/prospects" className="ml-auto shrink-0 rounded-[10px] bg-jano-papel px-3.5 py-2 text-[13.5px] font-semibold text-jano-tinta shadow-[inset_0_0_0_1px_var(--color-jano-linea)]">
            Ver contactos afectados
          </Link>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 xl:flex-row">
        <Card className="flex-1" title="Registro de auditoría" action={<><span className="text-[13px] font-normal text-jano-muted">Cada decisión, con la regla que se aplicó</span><Button variant="outline" size="sm">Exportar</Button></>}>
          <table className="w-full border-collapse text-[14.5px]">
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
                    <Pill tone={EVENT_PILL[e.type].tone}>{EVENT_PILL[e.type].label}</Pill>
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
                    <div className="text-[13.5px] font-semibold">Máximo de envíos por buzón y día</div>
                    <div className="text-[12.5px] text-jano-muted">Protege la reputación del dominio</div>
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
          <Card title="Salud del dominio de envío" className="flex-1">
            {(s?.domains ?? []).map((d) => (
              <div key={d.domain}>
                <div className="font-mono mb-2 text-xs text-jano-muted">{d.domain}</div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone={d.spf ? "g" : "r"}>SPF</Pill>
                  <Pill tone={d.dkim ? "g" : "r"}>DKIM</Pill>
                  <Pill tone={d.dmarc ? "g" : "r"}>DMARC</Pill>
                  <Pill tone={d.warmupDay < d.warmupTotalDays ? "b" : "g"}>
                    Calentamiento: día {d.warmupDay} de {d.warmupTotalDays}
                  </Pill>
                </div>
                <div className="mt-2.5 text-[13px] text-jano-muted tabular">
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

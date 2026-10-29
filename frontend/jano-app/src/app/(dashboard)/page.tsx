"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { AiTag, Button, Card, DemoPill, Dot, ListItem, Meter, Pill, Skeleton, Spark } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { useAuth } from "@/lib/auth/use-auth";
import { AGENT_LABEL, formatLongDate, formatShortDate, timeAgo } from "@/lib/format";

const FUNNEL_COLORS = ["var(--color-jano-tinta)", "var(--color-jano-cobalto-medio)", "var(--color-jano-cobalto)", "var(--color-jano-cobalto-claro)", "var(--color-jano-bronce)"];
const STATUS_DOT = { working: "g", deciding: "c", waiting_human: "w", idle: "n" } as const;

function Funnel({ values }: { values: number[] }) {
  const W = 118;
  const max = Math.max(...values, 1);
  const heights = values.map((v) => Math.max(16, (150 * v) / max));
  const paths = values.map((_, i) => {
    const x0 = i * W;
    const x1 = x0 + W - 6;
    const a = heights[i] ?? 16;
    const b = heights[i + 1] ?? a;
    const c = 85;
    return `M${x0} ${c - a / 2} C${x0 + 50} ${c - a / 2} ${x1 - 50} ${c - b / 2} ${x1} ${c - b / 2} L${x1} ${c + b / 2} C${x1 - 50} ${c + b / 2} ${x0 + 50} ${c + a / 2} ${x0} ${c + a / 2} Z`;
  });
  return (
    <svg viewBox={`0 0 ${values.length * W} 170`} className="my-1.5 w-full" aria-label="Embudo de la campaña">
      {paths.map((d, i) => (
        <path key={d} d={d} fill={FUNNEL_COLORS[i] ?? FUNNEL_COLORS[0]} />
      ))}
    </svg>
  );
}

export default function HomePage() {
  const auth = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: jano.getDashboardSummary });
  const d = q.data;
  const firstName = auth.status === "ready" ? auth.user.name.split(" ")[0] : "";

  return (
    <>
      <Topbar title={`Buenos días${firstName ? `, ${firstName}` : ""}`} subtitle={formatLongDate(new Date().toISOString())} />

      {!d ? (
        <div className="grid gap-3.5 lg:grid-cols-[1fr_2fr]">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {/* Una métrica manda: reuniones contra el objetivo. El resto es contexto. */}
          <div className="grid gap-3.5 lg:grid-cols-[1fr_2fr]">
            <Card className="flex flex-col justify-between">
              <div className="text-sm font-semibold text-jano-muted">Reuniones agendadas este mes</div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold leading-none tabular">{d.kpis.meetingsBooked.value}</span>
                <span className="text-base text-jano-muted tabular">de {d.meetingsGoal}</span>
              </div>
              <Meter value={d.kpis.meetingsBooked.value / Math.max(d.meetingsGoal, 1)} tone="w" label="Reuniones sobre el objetivo" />
              <div className="mt-2 text-sm text-jano-muted">
                {d.meetingsGoal > d.kpis.meetingsBooked.value
                  ? `Faltan ${d.meetingsGoal - d.kpis.meetingsBooked.value} para el objetivo`
                  : "Objetivo cumplido"}
              </div>
            </Card>
            <Card className="grid grid-cols-1 divide-y divide-jano-linea sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {(
                [
                  ["Cuentas encontradas", d.kpis.accountsFound],
                  ["Contactos verificados", d.kpis.contactsVerified],
                  ["Conversaciones abiertas", d.kpis.openConversations],
                ] as const
              ).map(([label, kpi]) => (
                <div key={label} className="py-3 first:pt-0 last:pb-0 sm:px-5 sm:py-0 sm:first:pl-0 sm:last:pr-0">
                  <div className="text-sm font-semibold text-jano-muted">{label}</div>
                  <div className="font-display my-1 text-2xl font-bold leading-none tabular">{kpi.value}</div>
                  <div className="text-sm text-jano-muted">{kpi.note}</div>
                </div>
              ))}
            </Card>
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[1.55fr_1fr]">
            <Card
              title="Embudo de la campaña"
              action={<DemoPill />}
            >
              <p className="-mt-2 mb-3 truncate text-sm text-jano-muted">{d.campaignName}</p>
              <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">
                {d.funnel.map((s, i) => {
                  const prev = d.funnel[i - 1];
                  return (
                    <div key={s.key} className="min-w-0">
                      <div className="font-display text-xl font-bold tabular">{s.value}</div>
                      <div className="truncate text-sm text-jano-muted">{s.label}</div>
                      <div className="text-xs text-jano-muted tabular">{prev && prev.value > 0 ? (
                          <>
                            {Math.round((100 * s.value) / prev.value)} %<span className="hidden xl:inline"> del paso anterior</span>
                          </>
                        ) : (
                          "\u00a0"
                        )}</div>
                    </div>
                  );
                })}
              </div>
              <Funnel values={d.funnel.map((s) => s.value)} />
              {d.insight && (
                <div className="ai-border mt-3 flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm">
                  <AiTag>Lectura de Jano</AiTag>
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">{d.insight.text}</span>
                  {d.insight.action && <Button size="sm">{d.insight.action}</Button>}
                </div>
              )}
            </Card>

            <Card
              ai
              title={
                <>
                  <Spark />
                  Agentes en vivo
                </>
              }
            >
              <ul>
                {d.agents.map((a) => (
                  <ListItem key={a.agent}>
                    <Dot tone={STATUS_DOT[a.status]} />
                    <div className="min-w-0">
                      <div className="font-semibold">{AGENT_LABEL[a.agent]}</div>
                      <div className="truncate text-sm text-jano-muted">{a.summary}</div>
                    </div>
                    <span className="font-mono ml-auto shrink-0 text-xs text-jano-muted">{timeAgo(a.at)}</span>
                  </ListItem>
                ))}
                {d.guardrailNotice && (
                  <li className="mt-2 rounded-xl bg-jano-bronce-tinte px-3 py-2 text-sm text-jano-bronce-texto">
                    <b>Regla aplicada:</b> {d.guardrailNotice}
                  </li>
                )}
              </ul>
            </Card>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card title="Requiere tu decisión" action={<Pill tone="b">{d.pending.length}</Pill>}>
              <ul>
                {d.pending.map((p, i) => (
                  <ListItem key={p.id}>
                    <div className="min-w-0">
                      <div className="font-semibold">{p.title}</div>
                      <div className="truncate text-sm text-jano-muted">{p.subtitle}</div>
                    </div>
                    <Link
                      href={p.href as "/"}
                      className={`ml-auto shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold ${i === 0 ? "bg-jano-cobalto text-white" : "shadow-[inset_0_0_0_1px_var(--color-jano-linea)]"}`}
                    >
                      {p.kind === "accounts_approval" ? "Ver" : "Revisar"}
                    </Link>
                  </ListItem>
                ))}
              </ul>
            </Card>

            <Card title="Reuniones por semana">
              <div className="flex h-[170px] items-end gap-1.5">
                {d.meetingsByWeek.map((w, i) => (
                  <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                    <div className="font-mono text-xs tabular">{w.count}</div>
                    <div className={`w-[34px] rounded-t-lg ${i === d.meetingsByWeek.length - 1 ? "bg-jano-bronce" : "bg-jano-cobalto"}`} style={{ height: Math.max(6, w.count * 38) }} />
                    <div className="font-mono text-xs text-jano-muted">{w.week}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 text-sm text-jano-muted">
                {d.kpis.meetingsBooked.value} agendadas. Objetivo del mes: {d.meetingsGoal}.
              </div>
            </Card>

            <Card title="Próximas reuniones">
              <ul>
                {d.upcomingMeetings.map((m) => (
                  <ListItem key={m.id}>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{m.accountName}</div>
                      <div className="text-sm text-jano-muted">
                        {m.status === "draft" ? "Sin fecha todavía" : formatShortDate(m.start)}
                        {m.status === "proposed" && " · propuesta, falta que confirmen"}
                      </div>
                    </div>
                    {/* Solo lo que te necesita lleva color. */}
                    {m.status === "draft" ? (
                      <Pill tone="b" className="ml-auto">
                        Pendiente de tu OK
                      </Pill>
                    ) : m.status === "confirmed" ? (
                      <span className="ml-auto text-sm font-semibold text-jano-verde-texto">Confirmada</span>
                    ) : null}
                  </ListItem>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

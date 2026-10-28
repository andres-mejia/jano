"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Button, Card, DemoPill, Dot, ListItem, Pill, Skeleton, Spark, Sparkline } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { useAuth } from "@/lib/auth/use-auth";
import { AGENT_LABEL, formatLongDate, formatShortDate, timeAgo } from "@/lib/format";

const FUNNEL_COLORS = ["#14162B", "#2C2A7A", "#4338D6", "#7B73F0", "#E39A2E"];
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
        <div className="grid grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Cuentas encontradas", d.kpis.accountsFound, "var(--color-jano-cobalto)"],
                ["Contactos verificados", d.kpis.contactsVerified, "var(--color-jano-cobalto)"],
                ["Conversaciones abiertas", d.kpis.openConversations, "var(--color-jano-cobalto)"],
                ["Reuniones agendadas", d.kpis.meetingsBooked, "var(--color-jano-bronce)"],
              ] as const
            ).map(([label, kpi, color]) => (
              <Card key={label} className="flex items-end justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-jano-muted">{label}</div>
                  <div className="font-display my-1 text-[34px] font-bold leading-none tabular">{kpi.value}</div>
                  <div className="text-[12.5px] text-jano-muted">{kpi.note}</div>
                </div>
                <Sparkline points={kpi.trend} color={color} />
              </Card>
            ))}
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[1.55fr_1fr]">
            <Card
              title="Embudo de la campaña"
              action={
                <>
                  <Pill tone="n">{d.campaignName}</Pill>
                  <DemoPill />
                </>
              }
            >
              <div className="grid grid-cols-5">
                {d.funnel.map((s) => (
                  <div key={s.key}>
                    <div className="font-display text-xl font-bold tabular">{s.value}</div>
                    <div className="text-[12.5px] text-jano-muted">{s.label}</div>
                  </div>
                ))}
              </div>
              <Funnel values={d.funnel.map((s) => s.value)} />
              <div className="font-mono grid grid-cols-5 text-[12.5px] text-jano-muted">
                {d.funnel.map((s, i) => {
                  const prev = d.funnel[i - 1];
                  return <div key={s.key}>{prev && prev.value > 0 ? `${Math.round((100 * s.value) / prev.value)} %` : ""}</div>;
                })}
              </div>
              {d.insight && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-jano-cobalto-tinte px-3.5 py-2.5 text-[13.5px] text-jano-cobalto-oscuro">
                  <Spark />
                  <span>
                    <b>Lectura de Jano:</b> {d.insight.text}
                  </span>
                  {d.insight.action && (
                    <Button size="sm" className="ml-auto">
                      {d.insight.action}
                    </Button>
                  )}
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
                      <div className="truncate text-[13px] text-jano-muted">{a.summary}</div>
                    </div>
                    <span className="font-mono ml-auto shrink-0 text-xs text-jano-muted">{timeAgo(a.at)}</span>
                  </ListItem>
                ))}
                {d.guardrailNotice && (
                  <ListItem>
                    <Pill tone="r">Guardarraíl</Pill>
                    <span className="text-[13px] text-jano-muted">{d.guardrailNotice}</span>
                  </ListItem>
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
                      <div className="truncate text-[13px] text-jano-muted">{p.subtitle}</div>
                    </div>
                    <Link
                      href={p.href as "/"}
                      className={`ml-auto shrink-0 rounded-[10px] px-3.5 py-2 text-[13.5px] font-semibold ${i === 0 ? "bg-jano-cobalto text-white" : "shadow-[inset_0_0_0_1px_var(--color-jano-linea)]"}`}
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
              <div className="mt-2.5 text-[13px] text-jano-muted">
                {d.kpis.meetingsBooked.value} agendadas. Objetivo del mes: {d.meetingsGoal}.
              </div>
            </Card>

            <Card title="Próximas reuniones">
              <ul>
                {d.upcomingMeetings.map((m) => (
                  <ListItem key={m.id}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jano-cobalto-tinte text-jano-cobalto">
                      <CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{m.accountName}</div>
                      <div className="text-[13px] text-jano-muted">{m.status === "draft" ? "Pendiente de tu OK" : formatShortDate(m.start)}</div>
                    </div>
                    <Pill tone={m.status === "confirmed" ? "g" : m.status === "proposed" ? "b" : "n"} className="ml-auto">
                      {m.status === "confirmed" ? "Confirmada" : m.status === "proposed" ? "Propuesta" : "Borrador"}
                    </Pill>
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

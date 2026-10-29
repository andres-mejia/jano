"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Topbar } from "@/components/layout/topbar";
import { Card, ListItem, Pill } from "@/components/ui/primitives";
import { jano } from "@/lib/api/jano";
import { DEMO_IDS } from "@jano/demo";
import { AGENT_LABEL, formatShortDate } from "@/lib/format";
import type { ProspectStage } from "@jano/domain";

/**
 * Lista de prospects. El contrato del MVP no tiene un listado de prospects
 * propio: se proyecta desde los eventos por etapa de la campaña. Cuando el
 * backend exponga `GET /campaigns/{id}/prospects`, el contrato se actualiza
 * antes y esta página lo consume (AGENTS.md §4).
 */
export default function ProspectsPage() {
  const campaignId = DEMO_IDS.campaign;
  const flow = useQuery({ queryKey: ["flow", campaignId], queryFn: () => jano.getFlowMap(campaignId) });
  const stages: ProspectStage[] = (flow.data?.nodes ?? []).flatMap((n) => (n.stage === "icp" ? [] : [n.stage]));
  const events = useQuery({
    queryKey: ["stage-events-all", campaignId, stages],
    queryFn: async () => (await Promise.all(stages.map((s) => jano.listStageEvents(campaignId, s)))).flat(),
    enabled: stages.length > 0,
  });
  const seen = new Set<string>();
  const latest = (events.data ?? [])
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((e) => {
      if (seen.has(e.prospectId)) return false;
      seen.add(e.prospectId);
      return true;
    });

  return (
    <>
      <Topbar title="Prospects" subtitle="Cada prospect es una cuenta con contacto dentro de una campaña" />
      <Card title="Con actividad reciente">
        <ul>
          {latest.map((e) => {
            const [name, ...rest] = e.summary.split(":");
            return (
              <ListItem key={e.prospectId}>
                <div className="min-w-0">
                  <Link href={`/prospects/${e.prospectId}` as "/prospects"} className="font-semibold hover:underline">
                    {name}
                  </Link>
                  <div className="truncate text-[13px] text-jano-muted">{rest.join(":").trim() || e.summary}</div>
                </div>
                <span className="font-mono ml-auto shrink-0 text-xs text-jano-muted">{formatShortDate(e.at)}</span>
                <Pill tone="n">{AGENT_LABEL[e.agent]}</Pill>
              </ListItem>
            );
          })}
        </ul>
        {latest.length === 0 && <p className="py-6 text-center text-sm text-jano-muted">Todavía no hay prospects con actividad.</p>}
      </Card>
    </>
  );
}
